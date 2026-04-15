---
name: publish-social-post
description: Publishes an approved social media post (image + caption) to Instagram and Facebook via their Graph API.
---
# Publish Social Post Workflow

## Required Environment Variables

Before running, ensure the root `.env` has these fields (add them if missing):
```
META_PAGE_ACCESS_TOKEN=your_page_access_token
META_PAGE_ID=your_page_id
META_INSTAGRAM_ACCOUNT_ID=your_instagram_business_account_id
```

## Steps

When the user asks to publish or post a specific social media post:

1. Identify the `client_id` and the `post_id`.
2. Verify the post status in `clients/<client_id>/posts/<post_id>.json` is `approved`.
3. Locate the associated media file (e.g., `<post_id>.png` or `.mp4`). If missing, warn the user and stop.
4. Read `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`, and `META_INSTAGRAM_ACCOUNT_ID` from the root `.env`.
5. Determine publish target based on `media_type` in the post JSON:
   - `image` / `carousel` → use the Instagram Container API (`/{ig-user-id}/media` + `/{ig-user-id}/media_publish`)
   - `video` / `story` → use the Instagram Reels endpoint or Stories container
6. Create a temporary script using Bun in the `ui` folder that:
   - Uploads the media to the Instagram Graph API container endpoint.
   - Waits for `status_code` to be `FINISHED` before publishing (poll every 3s, max 30s).
   - Calls the publish endpoint with the container ID.
   - Appends `content` + `hashtags` from the JSON as the caption.
7. Execute the script via `run_shell_command`.
8. On success, update the local JSON `status` to `published` and delete the temporary script.
9. On failure, preserve the temporary script for debugging and report the API error to the user.
