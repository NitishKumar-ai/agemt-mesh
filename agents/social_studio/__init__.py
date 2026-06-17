"""
Social Studio agent package.

providers/  — Adapted from brightbean-studio (MIT licence)
  base.py, types.py, exceptions.py — copied verbatim
  bluesky.py, linkedin.py, threads.py, instagram.py — adapted (removed Django deps)

content_generator.py — AI content generation with Gemini
publisher.py         — Calls provider.publish_post() + writes publish log
analytics.py         — Pulls metrics from platform APIs + writes snapshots
"""
