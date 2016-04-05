function f_3_0 (x, y) {
  x = x + 1;
  y = y + 1;
  var p = x + y;
  p *= 2;

  if (p == 0) {
    return 0;
  } else {
    return 1;
  }
}

function f_3_1 (x, y) {
  var a = x * y;
  var b = a * 2;

  if (b == 190) {
    return 'b = 190';
  } else {
    return 'b != 190';
  }
}

function f_3_2 (x, y) {
  var a = x * y;
  var b = a * 2;

  return (b == 800)
    ? 'b  = 190'
    : 'b != 190';
}

function f_3_3 (x) {
  var a = x + 10;

  a += 100;
  a *= 2;

  if (a == 500) {
    return 'a = 500';
  } else {
    return 'a != 500';
  }
}

function f_3_4 (x, y) {
  var p = x + y;
  p *= x + y;
  p += 100;

  if (p == 100) {
    return 'p = 100';
  } else {
    return 'p != 100';
  }
}
