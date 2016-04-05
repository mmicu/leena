function f_1_0 (x) {
  if (x == 1) {
    return 1;
  } else if (x == 2) {
    return 2;
  } else if (x == 3) {
    return 3;
  }

  return -1;
}

function f_1_1 (x) {
  if (x == 1) {
    return 1;
  } else if (x == 2) {
    return 2;
  } else if (x == 3) {
    return 3;
  }

  return -1;
}

function f_1_2 (x) {
  if (x == 1 || x == 2) {
    return '1 or 2';
  } else if (x == 3 || x > 3) {
    return '3 or > 3';
  }

  return -1;
}

function f_1_3 (x, y, z) {
  if (x == 1 && y == 1) {
    return 1;
  } else if (x == 2 || y == 1) {
    return 2;
  } else if (x == 3 && z == 2) {
    return 3;
  } else if (z == 190) {
    return 4;
  } else {
    return -1;
  }
}

function f_1_4 (a, b) {
  if (a > 0) {
    if (a == 19) {
      if (b == 0) {
        return 1;
      } else {
        return 2;
      }
    }
  } else {
    if (a == -1) {
      return 3;
    } else if (a == -90) {
      return 4;
    }
  }

  return -1;
}
