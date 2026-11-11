# Astra design review

A separate critique reviewed the desktop and mobile screenshots and the relevant components. The findings are ordered by impact.

| Rank | Finding | Resolution |
| ---: | --- | --- |
| 1 | Mobile Lens had about 100px of space between the navigation and title. | Give the header a content-sized grid row and let the workspace take the remaining height. |
| 2 | The upload control occupied about 200px after a board had been recognized. | Use a compact replace control in review state so the board and search action come into view earlier. |
| 3 | Landing previews cropped the bottom of the board. The desktop layout also shrank the result text on phones. | Capture complete boards and use dedicated mobile preview crops. |
| 4 | Sandbox used a different name from its navigation item and a terse search label. | Share the Lens workspace header, explain what Sandbox does, and use the 44px primary button for finding matching games. |
| 5 | Match results took up too much vertical space and counted positions while listing games. | Count distinct games and place move, tournament, and year metadata together. Keep Replay at least 44px high. |
| 6 | The template-match score was more prominent than the squares needing review. | Consider making the highlighted square count the primary review instruction. |
| 7 | The engine heading wrapped and raw coordinate moves took effort to read. | Consider giving the heading a full row and formatting the principal variation as SAN. |
| 8 | The Sandbox FEN field extended beyond the board width. | Align the position input with the board as part of the shared workspace layout. |
| 9 | Preview captions and uppercase labels were small on mobile. | Increase informational captions to at least 12px in a future typography pass. |
| 10 | Recognition combined a scan line and a spinner. | Consider using the scan line and text during recognition, and skeletons during search. |

The five highest-impact changes are reflected in the final captures in this directory.
