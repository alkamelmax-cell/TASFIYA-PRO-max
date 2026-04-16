// Shared date/number formatting utilities for Tasfiya Pro renderer
function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '0.00';
  const numericAmount = parseFloat(amount);
  if (Number.isNaN(numericAmount)) return '0.00';
  return numericAmount.toFixed(2);
}

function formatDate(value) {
  if (!value) return 'غير محدد';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'غير محدد';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDateTime(value) {
  if (!value) return 'غير محدد';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'غير محدد';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function formatNumber(number) {
  if (number === null || number === undefined) return '0';
  try {
    return new Intl.NumberFormat('en-US').format(number);
  } catch (error) {
    console.error('Error formatting number:', error);
    return String(number);
  }
}

function arabicToEnglishNumbers(text) {
  if (!text) return text;
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const englishDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  let result = String(text);
  for (let i = 0; i < arabicDigits.length; i += 1) {
    result = result.replace(new RegExp(arabicDigits[i], 'g'), englishDigits[i]);
  }
  return result;
}

function getCurrentDate() {
  return formatDate(new Date());
}

function getCurrentDateTime() {
  return formatDateTime(new Date());
}

function formatDecimal(value, decimalPlaces = 2) {
  if (value === null || value === undefined) return '0.00';
  const numericValue = parseFloat(value);
  if (Number.isNaN(numericValue)) return '0.00';
  return numericValue.toFixed(decimalPlaces);
}

module.exports = {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  arabicToEnglishNumbers,
  getCurrentDate,
  getCurrentDateTime,
  formatDecimal
};
