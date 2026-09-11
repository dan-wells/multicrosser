// Convert the server's initial state (cols x rows, sparse, holes as null) into
// a dense cols x rows array of strings.
export function toGrid(initialState, dimensions) {
  return Array.from({ length: dimensions.cols }, (_, x) =>
    Array.from({ length: dimensions.rows }, (_, y) =>
      (initialState[x] && initialState[x][y]) || ''
    )
  );
}

export default toGrid;
