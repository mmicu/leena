function f_4_0 (x, y) {
  if (x > 0) {
    return (y > 0)
      ? 1
      : 0;
  } else if (x < 0) {
    if (y == 1) {
      return (x == -1)
        ? -1
        : 0;
    } else if (y == 2) {
      return (x == -2)
        ? -1
        : 0;
    } else {
      return (x == -3)
        ? -1
        : 0;
    }
  }
}

function f_4_1 (a) {
  var b = a + 1;
  b -= 100;

  if (b == 1) {
    return 'b = 1';
  } else {
    return 'b != 1';
  }
}

function f_4_2 (a, b) {
  var b = a + 1;

  return (b == 1)
    ? 'b = 1'
    : 'b != 1';
}

function f_4_3 (a, b) {
  return (a == (b * 100))
    ? 1
    : 0;
}

function f_4_4 (a, b) {
  return (a == (b * 56 - 45))
    ? 1
    : 0;
}
