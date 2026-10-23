# Meta roadblocks and the system we built

Integration history recorded **23 October 2026**. This captures our project's experience, not a claim that every Meta integration fails. The current technical setup is in [Instagram operation](../INSTAGRAM-SETUP.md).

## What blocked us

The original plan used Meta's official Instagram API, with a server-held token and a renewal Worker. Developer/account authorization became the blocker rather than the gallery code. One captured Meta dialog said account changes could not be made from an unfamiliar device until that device had been used for some time. Repeating a verification code did not establish permission to make the change. We could not confirm a waiting period that would reliably resolve it.

Postman was not a workaround for Meta's account verification: an API client cannot grant authorization the account does not have. Tokenless options and Behold were considered, but we did not make them production dependencies. The owner preferred keeping account credentials away from another feed service and building a small public-link collector. Hourly discovery was sufficient; second-by-second polling was unnecessary.

The practical frustration was spending effort on account/developer access when the actual content was already publicly viewable. That access flow was unreliable for this project's needs. We should not tell a future maintainer that another signup, API client or repeated login will solve the same blocker without verifying it.

## The owner's unfiltered verdict

These lines are intentionally retained as project commentary, not product copy or messages sent to Meta:

> FUCK U META
>
> SUCK IT MARK
>
> I MADE MY OWN
>
> ALL THIS FUCKING BUREAUCRACY FOR A PUBLIC POST LINK.
>
> THE POSTS WERE PUBLIC. THE REAL CHALLENGE WAS YOUR DEVELOPER PORTAL.
>
> WE WANTED AN EMBED, MARK. NOT A SECOND CAREER IN META ACCOUNT VERIFICATION.

## What replaced the blocked dependency

The existing public archive was seeded, then `chii-instagram-links` used anonymous Cloudflare Browser Rendering to discover public links hourly and preserve them in KV. The site reads that archive and presents three recent posts plus nine randomized older posts in the swipeable row. Embeds are deferred until the section/cards need them. Account passwords, Instagram cookies and Meta access tokens are not needed by this active path.

Monthly GitHub Actions work uses the archive to fetch actual still photos, excluding Reel covers/video, then exports small responsive WebP files. Each successful batch adds five recent eligible photos and five random older photos. The rolling pool caps at 50 including the originals; the approved Meet Chii image remains fixed. Existing content survives failed discovery/import attempts.

## What we did not solve away

We built our own link discovery and photo import orchestration, not Instagram's embed service. Public pages can change, challenge or block anonymous requests; embeds and source media can fail independently. A naturally scheduled collector success was observed on 23 October, and the corrected manually dispatched monthly workflow succeeded. The first natural monthly run had not yet occurred at this checkpoint. Future new-post ingestion and continued anonymous access are not guaranteed.

Keep bounded requests, caches and the last good content. Do not bypass login/challenges, extract sessions, manufacture archive success or turn a fallback into a false claim that a post is gone. The retained official API implementation can be reconsidered only if an authorized, verified setup becomes practical. See [hourly proof](instagram-hourly-verification-2026-10-23.md), [monthly release](monthly-photos-release-2026-10-23.md), and [monthly design](monthly-photos.md).
