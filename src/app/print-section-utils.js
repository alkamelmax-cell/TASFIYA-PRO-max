function createPrintSectionUtils(context) {
  const formatDate = context.formatDate;

function safeFieldValue(obj, field, defaultValue = 'غير محدد') {
  if (!obj) return defaultValue;
  const value = obj[field];
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }
  return value;
}

function safeDateFormat(dateString) {
  if (!dateString) return '-';
  try {
    return formatDate(dateString);
  } catch (error) {
    return '-';
  }
}

  return {
    safeFieldValue,
    safeDateFormat
  };
}

module.exports = {
  createPrintSectionUtils
};
