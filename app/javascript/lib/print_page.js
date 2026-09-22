// Marks `target` as the block that the tight layout fits to the page height on
// paper (see `.print-fit` in `print-page.css`), and gives that rule what it
// needs: the shape of `grid`, from its viewBox, and how far `target` sits below
// the top of the page, which is the space the header takes.
export function fitToPage(target, grid) {
  const printPage = target.closest('.print-page');
  const { width, height } = grid.viewBox.baseVal;
  const headerHeight = target.getBoundingClientRect().top - printPage.getBoundingClientRect().top;
  target.classList.add('print-fit');
  target.style.setProperty('--grid-aspect', width / height);
  target.style.setProperty('--header-height', `${headerHeight}px`);
}
