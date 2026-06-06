function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function roundScore(value) {
  return clamp(Math.round(value), 0, 100);
}

function scoreRatio(count, total) {
  if (!total) {
    return 0;
  }
  return clamp(count / total, 0, 1);
}

export {
  clamp,
  roundScore,
  scoreRatio
};
