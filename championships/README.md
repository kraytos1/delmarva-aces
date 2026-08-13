# Championship photos (The Rafters)

Drop the coach's CHAMPIONS shot in **this folder** using the filename below and
it shows up at the top of that banner's drawer on `/banners.html`. No code
change, no deploy step beyond committing the file — the page looks for the file
by name and simply renders nothing if it isn't there yet.

Save it as **`.jpg`** (or `.png`). Those are the only two extensions the page
looks for — every extra one it checks costs a wasted request on banners that
have no photo yet.

| Banner | Filename |
|---|---|
| President's Day 42 Challenge | `presidents-day-42-challenge.jpg` |
| Ripken Opening Day | `ripken-opening-day.jpg` |
| USSSA Shake the Rust Rumble | `usssa-shake-the-rust-rumble.jpg` |
| Mutiny in the Park | `mutiny-in-the-park.jpg` |
| OBX Bash at the Beach | `obx-bash-at-the-beach.jpg` |
| Who's Who | `whos-who.jpg` |
| Shipyard #82 | `shipyard-82.jpg` |
| ESTB Memorial Day Classic | `estb-memorial-day-classic.jpg` |
| Perfect Game Bear Down | `perfect-game-bear-down.jpg` |
| Cooperstown | `cooperstown.jpg` |

**Adding a future title?** The filename is just the banner's name lowercased
with every run of non-letters/numbers turned into a single dash — so
"Fall Brawl #3" becomes `fall-brawl-3.jpg`.

### Notes

- **Size:** anything up to ~2000px wide is plenty. The drawer caps display
  height at 420px and crops toward the top of the frame, so photos where the
  team fills the width look best.
- **Privacy:** `/banners.html` is `noindex, nofollow` because it carries photos
  of the kids — same rule as the photo gallery. Families can open it from the
  nav or a shared link; search engines are asked to stay out. If you ever want
  the page findable, remove the robots meta tag in `banners.html` — but do that
  knowingly, since these are minors.
- These are committed to the repo rather than uploaded to Supabase because they
  are a fixed historical set that never changes. Season photo uploads still
  belong in the gallery (`photos.html`, coach PIN).
