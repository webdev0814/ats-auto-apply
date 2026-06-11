// A lightweight in-memory queue to replace BullMQ/Redis for local MVP testing
const jobs = [];
const handlers = {};

class Queue {
    constructor(name) {
        this.name = name;
    }

    async add(jobName, data) {
        console.log(`[Queue: ${this.name}] Added job: ${jobName}`);
        const job = { data, name: jobName, id: Date.now() };
        jobs.push(job);
        
        // Do not immediately process in Queue. Worker will poll.
        return job;
    }
}

class Worker {
    constructor(name, processor, options = {}) {
        this.name = name;
        this.processor = processor;
        this.concurrency = options.concurrency || 1;
        this.activeJobs = 0;
        
        // Start a loop to pull jobs based on concurrency limit
        this.interval = setInterval(async () => {
            while (this.activeJobs < this.concurrency && jobs.length > 0) {
                const job = jobs.shift();
                if (job) {
                    this.activeJobs++;
                    this.processor(job).catch(err => {
                        console.error(`[Worker] Job ${job.id} failed:`, err);
                    }).finally(() => {
                        this.activeJobs--;
                    });
                }
            }
        }, 500);

        // Fire ready event
        setTimeout(() => {
            if (this.onReadyCallback) this.onReadyCallback();
        }, 100);
    }

    on(event, callback) {
        if (event === 'ready') {
            this.onReadyCallback = callback;
        }
    }
}

module.exports = { Queue, Worker, connection: null };
