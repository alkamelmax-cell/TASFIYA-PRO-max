function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function summarizeStatementTransactions(transactions, options = {}) {
  const rows = Array.isArray(transactions) ? transactions : [];
  const openingBalance = toNumber(options.openingBalance);
  const order = options.order === 'asc' ? 'asc' : 'desc';

  let totalPostpaid = 0;
  let totalReceipts = 0;
  rows.forEach((tx) => {
    const amount = toNumber(tx?.amount);
    if (tx?.type === 'postpaid') {
      totalPostpaid += amount;
      return;
    }
    totalReceipts += amount;
  });

  const periodNet = totalPostpaid - totalReceipts;
  const closingBalance = openingBalance + periodNet;

  if (order === 'asc') {
    let runningBalance = openingBalance;
    const decoratedRows = rows.map((tx) => {
      const amount = toNumber(tx?.amount);
      const debit = tx?.type === 'postpaid' ? amount : 0;
      const credit = tx?.type === 'postpaid' ? 0 : amount;
      runningBalance += debit - credit;

      return {
        ...tx,
        amount,
        debit,
        credit,
        runningBalance
      };
    });

    return {
      openingBalance,
      totalPostpaid,
      totalReceipts,
      periodNet,
      closingBalance,
      rows: decoratedRows
    };
  }

  let runningBalance = closingBalance;
  const decoratedRows = rows.map((tx) => {
    const amount = toNumber(tx?.amount);
    const row = {
      ...tx,
      amount,
      runningBalance
    };

    if (tx?.type === 'postpaid') {
      runningBalance -= amount;
    } else {
      runningBalance += amount;
    }

    return row;
  });

  return {
    openingBalance,
    totalPostpaid,
    totalReceipts,
    periodNet,
    closingBalance,
    rows: decoratedRows
  };
}

function shouldShowOpeningBalanceRow(dateFrom, openingBalance) {
  if (String(dateFrom || '').trim()) {
    return true;
  }
  return Math.abs(toNumber(openingBalance)) > 0.000001;
}

module.exports = {
  summarizeStatementTransactions,
  shouldShowOpeningBalanceRow
};
