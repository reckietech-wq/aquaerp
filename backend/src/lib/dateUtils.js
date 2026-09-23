const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const IST = 'Asia/Kolkata';

// Start of the IST calendar day that `date` falls in, as a UTC Date object
// (suitable for Prisma gte/lte comparisons against UTC-stored timestamps).
function istDayStart(date = new Date()) {
  return dayjs(date).tz(IST).startOf('day').toDate();
}

function istDayEnd(date = new Date()) {
  return dayjs(date).tz(IST).endOf('day').toDate();
}

// [start, end) bounds of an IST calendar month, as UTC Date objects.
function istMonthStart(year, month) {
  return dayjs.tz(`${year}-${String(month).padStart(2, '0')}-01`, IST).startOf('month').toDate();
}

function istMonthEnd(year, month) {
  return dayjs.tz(`${year}-${String(month).padStart(2, '0')}-01`, IST).endOf('month').toDate();
}

// Current IST year/month (1-12), for "this month" defaults.
function currentIstYearMonth() {
  const now = dayjs().tz(IST);
  return { year: now.year(), month: now.month() + 1 };
}

// dd/mm/yyyy, in IST — for all date display (invoices, statements, PDFs).
function formatIstDate(date) {
  return dayjs(date).tz(IST).format('DD/MM/YYYY');
}

module.exports = {
  IST,
  istDayStart,
  istDayEnd,
  istMonthStart,
  istMonthEnd,
  currentIstYearMonth,
  formatIstDate,
};
