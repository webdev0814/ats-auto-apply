import sys
import json
import csv
from jobspy import scrape_jobs
import pandas as pd

def main():
    if len(sys.argv) < 5:
        print("Usage: python jobspy_runner.py <search_term> <location> <is_remote_boolean> <hours_old>")
        sys.exit(1)

    search_term = sys.argv[1]
    location = sys.argv[2]
    is_remote = sys.argv[3].lower() in ['true', '1', 't']
    hours_old = int(sys.argv[4])

    print(f"Running JobSpy for: '{search_term}' in '{location}' (Remote: {is_remote}) past {hours_old} hours...", file=sys.stderr)

    try:
        jobs = scrape_jobs(
            site_name=["linkedin", "indeed", "glassdoor"],
            search_term=search_term,
            location=location,
            results_wanted=20, # Limit to 20 per run for testing to avoid IP bans
            hours_old=hours_old,
            is_remote=is_remote,
            country_dict={"USA": "usa"} if "US" in location else None
        )

        if jobs is not None and not jobs.empty:
            # Drop NaN rows
            jobs = jobs.where(pd.notnull(jobs), None)
            
            # Format to JSON
            jobs_list = jobs.to_dict(orient="records")
            # Filter out jobs that don't have a job_url
            valid_jobs = [j for j in jobs_list if j.get("job_url")]
            print(json.dumps(valid_jobs))
        else:
            print(json.dumps([]))
            
    except Exception as e:
        print(f"JobSpy Error: {str(e)}", file=sys.stderr)
        print(json.dumps([]))

if __name__ == "__main__":
    main()
