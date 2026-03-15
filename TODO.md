- [x] Add text boxes for room ID and puzzle number to homepage
- [x] Add 404 page for unavailable puzzles
- [x] Shorten the length of random room IDs -- we won't have that many users
- [ ] Add links to setter pages
- [x] Fix bad spacing between crossword controls and text below crossword
- [ ] Fix bad spacing between crossword grid and buttons in narrow viewports
- [x] Reduce horizontal spacing between Across and Down clues columns
- [ ] Add puzzle timer
    * should only count time actively on the page
    * probably don't want to show it while running, but have final time display on final check
    * or could add a button to show it with pause/reset etc. controls
- [ ] Add links to fifteensquared posts per puzzle
    * RSS feed here: http://www.fifteensquared.net/feed/
    * For old puzzles, need to see about parsing the archive, e.g. for Quiptics: https://www.fifteensquared.net/category/guardian/guardianquiptic/
- [ ] Update package versions to be recent enough for easy installation/maintenance
    * decide whether we want to keep tabbing through clues or update to [] to navigate
- [ ] Change URLs on web server
    * [ ] crosswords.wellsd.net -> wellsd.net/crosswords
    * [x] simplify, remove `crossword/` part from individual puzzle URLs
- [ ] limit random puzzle button to avoid any puzzles which have been completed in the specified room
    * -> need to track puzzle completion in redis ?
    * maybe also have an explicit "mark complete" button in case you come across one you've already done
