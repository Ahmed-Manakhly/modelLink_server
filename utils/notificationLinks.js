function orderLinkForRole(role, orderId) {
  return `/order/view/${orderId}`;
}

function ordersListLinkForRole(role) {
  if (role === 'CLIENT') return '/orders-client';
  if (role === 'DEVELOPER') return '/dashboard-dev';
  return '/admin';
}

function walletLink() {
  return '/wallet';
}

async function orderLinkForUser(prisma, userId, orderId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return orderLinkForRole(user?.role, orderId);
}

async function ordersListLinkForUser(prisma, userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return ordersListLinkForRole(user?.role);
}

module.exports = {
  orderLinkForRole,
  ordersListLinkForRole,
  walletLink,
  orderLinkForUser,
  ordersListLinkForUser,
};
