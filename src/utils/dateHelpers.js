/**
 * Returns today's date as YYYY-MM-DD (local server time).
 * Used as the "date" key on Attendance documents.
 */
const getTodayDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Difference between two dates in hours (decimal).
 */
const hoursBetween = (laterDate, earlierDate) => {
  return (new Date(laterDate) - new Date(earlierDate)) / (1000 * 60 * 60);
};

module.exports = { getTodayDateString, hoursBetween };
