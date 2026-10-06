const BASE = process.env.API_BASE || "http://localhost:3001/backend/v1";

async function json(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function main() {
  const loginRes = await fetch(`${BASE}/auth/email/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "helen.bole@mamas.et",
      password: "2107",
    }),
  });
  const login = await json(loginRes);
  if (!loginRes.ok) {
    console.error("login failed", loginRes.status, login);
    process.exit(1);
  }
  const token = login.token;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const meRes = await fetch(`${BASE}/auth/me`, { headers });
  const me = await json(meRes);
  console.log("auth context", {
    roleCode: me.roleCode,
    shiftSessionId: me.shiftSessionId,
  });

  if (!me.shiftSessionId) {
    await fetch(`${BASE}/shifts/clock-in`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
  }

  const openRes = await fetch(`${BASE}/dispatcher/calls`, {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": `e2e-${Date.now()}` },
    body: JSON.stringify({
      customerName: "E2E Pickup",
      customerPhone: "+251911111222",
    }),
  });
  const opened = await json(openRes);
  if (!openRes.ok) {
    console.error("open failed", openRes.status, opened);
    process.exit(1);
  }
  const tableSessionId = opened.tableSessionId;
  console.log("opened", {
    tableSessionId,
    sessionKind: opened.sessionKind,
    version: opened.version,
  });

  const menuRes = await fetch(
    `${BASE}/waiter/menu?tableSessionId=${tableSessionId}`,
    { headers },
  );
  const menu = await json(menuRes);
  const item =
    menu.categories?.flatMap((c) => c.items || []).find((i) => i.menuItemId) ||
    menu.items?.[0] ||
    menu.data?.[0];
  console.log("menu", menuRes.status, {
    item: item?.menuItemId || item?.id,
    name: item?.name || item?.displayName,
  });
  if (!item) {
    console.error("no menu item", menu);
    process.exit(1);
  }

  const menuItemId = item.menuItemId || item.id;
  const confirmRes = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": `e2e-order-${Date.now()}` },
    body: JSON.stringify({
      tableSessionId,
      expectedTableSessionVersion: opened.version,
      items: [{ menuItemId, quantity: 1 }],
    }),
  });
  const confirmed = await json(confirmRes);
  console.log("confirm", confirmRes.status, {
    orderId: confirmed.orderId,
    version: confirmed.tableSession?.version,
  });
  if (!confirmRes.ok) {
    console.error(confirmed);
    process.exit(1);
  }

  const sendRes = await fetch(`${BASE}/orders/send-to-kitchen`, {
    method: "POST",
    headers,
    body: JSON.stringify({ tableSessionId }),
  });
  const sent = await json(sendRes);
  console.log("send kitchen", sendRes.status, sent);

  const billReqRes = await fetch(
    `${BASE}/table-sessions/${tableSessionId}/bill-requests`,
    {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": `e2e-billreq-${Date.now()}` },
      body: JSON.stringify({
        expectedTableSessionVersion:
          confirmed.tableSession?.version || opened.version + 1,
      }),
    },
  );
  const billReq = await json(billReqRes);
  console.log("bill request", billReqRes.status, {
    billRequestId: billReq.billRequestId,
    version: billReq.tableSession?.version,
  });
  if (!billReqRes.ok) {
    console.error(billReq);
    process.exit(1);
  }

  const genRes = await fetch(
    `${BASE}/bill-requests/${billReq.billRequestId}/generate`,
    {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": `e2e-gen-${Date.now()}` },
      body: JSON.stringify({
        expectedTableSessionVersion: billReq.tableSession.version,
      }),
    },
  );
  const bill = await json(genRes);
  console.log("generate bill", genRes.status, {
    billId: bill.billId,
    total: bill.total,
    status: bill.status,
  });
  if (!genRes.ok) {
    console.error(bill);
    process.exit(1);
  }

  const payRes = await fetch(`${BASE}/bills/${bill.billId}/payments/cash`, {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": `e2e-pay-${Date.now()}` },
    body: JSON.stringify({
      amount: bill.total,
      cashTendered: bill.total,
      expectedBillVersion: bill.version,
    }),
  });
  const pay = await json(payRes);
  console.log("pay cash", payRes.status, {
    payment: pay.payment?.status,
    session: pay.tableSession?.status,
  });
  if (!payRes.ok) {
    console.error(pay);
    process.exit(1);
  }

  const cashRes = await fetch(`${BASE}/cash/waiter-summary`, { headers });
  const cash = await json(cashRes);
  console.log("cash summary", cashRes.status, {
    undroppedCash: cash.undroppedCash,
    cashCollected: cash.cashCollected,
  });

  const boardRes = await fetch(`${BASE}/dispatcher/calls`, { headers });
  const board = await json(boardRes);
  const row = board.data?.find((c) => c.tableSessionId === tableSessionId);
  console.log("board row", row?.boardColumn, row?.customerName);

  console.log("E2E OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
