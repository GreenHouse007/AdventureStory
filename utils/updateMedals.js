// utils/updateMedals.js
exports.updateUserMedals = function (user) {
  const death = user.progress.reduce(
    (sum, p) => sum + (p.deathEndingCount || 0),
    0
  );
  const trueEndings = user.progress.filter((p) => p.trueEndingFound).length;

  user.medals.death =
    death >= 20
      ? "platinum"
      : death >= 10
      ? "gold"
      : death >= 5
      ? "silver"
      : death >= 1
      ? "bronze"
      : "none";

  user.medals.trueEnding =
    trueEndings >= 10
      ? "platinum"
      : trueEndings >= 5
      ? "gold"
      : trueEndings >= 3
      ? "silver"
      : trueEndings >= 1
      ? "bronze"
      : "none";
};
