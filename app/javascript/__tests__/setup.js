// JSDOM doesn't implement Element.scrollIntoView; @guardian/react-crossword
// calls it on the selected clue when scrollToSelected is set.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
