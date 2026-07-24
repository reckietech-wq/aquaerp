require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ─── Data definitions ────────────────────────────────────────────────────────

const DRIVER_DEFS = [
  { name: 'Rajesh Kumar',  mobile: '9876543210', vehicleNumber: 'MH12AB1234', vehicleType: 'Tempo', route: '1', loginId: 'driver1', tempoLabel: 'Tempo T1' },
  { name: 'Sunil Patil',   mobile: '9876543211', vehicleNumber: 'MH12CD5678', vehicleType: 'Tempo', route: '2', loginId: 'driver2', tempoLabel: 'Tempo T2' },
  { name: 'Anil Sharma',   mobile: '9876543212', vehicleNumber: 'MH12EF9012', vehicleType: 'Auto',  route: '3', loginId: 'driver3', tempoLabel: 'Auto A1'  },
  { name: 'Mahesh Jadhav', mobile: '9876543213', vehicleNumber: 'MH12GH3456', vehicleType: 'Tempo', route: '4', loginId: 'driver4', tempoLabel: 'Tempo T4' },
  { name: 'Vikram Singh',  mobile: '9876543214', vehicleNumber: 'MH12IJ7890', vehicleType: 'Bike',  route: '5', loginId: 'driver5', tempoLabel: 'Bike B1'  },
];

const CLIENT_DEFS = [
  // Driver 1
  { name: 'Ramesh Agarwal',   mobile: '9811001001', email: 'ramesh@gmail.com', address: '12, Shivaji Nagar, Pune', driverIdx: 0 },
  { name: 'Sunita Mehta',     mobile: '9811001002', email: null,               address: '45, MG Road, Pune',       driverIdx: 0 },
  { name: 'Deepak Joshi',     mobile: '9811001003', email: 'deepak@gmail.com', address: '78, FC Road, Pune',       driverIdx: 0 },
  { name: 'Priya Desai',      mobile: '9811001004', email: null,               address: '23, Baner Road, Pune',    driverIdx: 0 },
  // Driver 2
  { name: 'Amit Shah',        mobile: '9811002001', email: 'amit@gmail.com',   address: '56, Koregaon Park, Pune', driverIdx: 1 },
  { name: 'Kavita Rao',       mobile: '9811002002', email: null,               address: '89, Kalyani Nagar, Pune', driverIdx: 1 },
  { name: 'Sanjay Kulkarni',  mobile: '9811002003', email: 'sanjay@gmail.com', address: '34, Viman Nagar, Pune',   driverIdx: 1 },
  { name: 'Meena Pillai',     mobile: '9811002004', email: null,               address: '67, Wakad, Pune',         driverIdx: 1 },
  // Driver 3
  { name: 'Rohit Verma',      mobile: '9811003001', email: 'rohit@gmail.com',  address: '11, Hinjewadi, Pune',     driverIdx: 2 },
  { name: 'Sneha Nair',       mobile: '9811003002', email: null,               address: '22, Pimple Saudagar, Pune', driverIdx: 2 },
  { name: 'Kiran Bhosale',    mobile: '9811003003', email: 'kiran@gmail.com',  address: '33, Wakad, Pune',         driverIdx: 2 },
  { name: 'Pooja Iyer',       mobile: '9811003004', email: null,               address: '44, Baner, Pune',         driverIdx: 2 },
  // Driver 4
  { name: 'Nitin Chavan',     mobile: '9811004001', email: 'nitin@gmail.com',  address: '15, Hadapsar, Pune',      driverIdx: 3 },
  { name: 'Anita Gupta',      mobile: '9811004002', email: null,               address: '26, Wanowrie, Pune',      driverIdx: 3 },
  { name: 'Suresh Pawar',     mobile: '9811004003', email: 'suresh@gmail.com', address: '37, Kondhwa, Pune',       driverIdx: 3 },
  { name: 'Rekha Jain',       mobile: '9811004004', email: null,               address: '48, Bibwewadi, Pune',     driverIdx: 3 },
  // Driver 5
  { name: 'Arun Tiwari',      mobile: '9811005001', email: 'arun@gmail.com',   address: '19, Kothrud, Pune',       driverIdx: 4 },
  { name: 'Lakshmi Nambiar',  mobile: '9811005002', email: null,               address: '28, Deccan, Pune',        driverIdx: 4 },
  { name: 'Ganesh Mane',      mobile: '9811005003', email: 'ganesh@gmail.com', address: '37, Sinhagad Road, Pune', driverIdx: 4 },
  { name: 'Pallavi Shinde',   mobile: '9811005004', email: null,               address: '46, Warje, Pune',         driverIdx: 4 },
];

const ADDITIONAL_CLIENT_DEFS = [
  // Driver 1 (Rajesh Kumar)
  { name: 'Vikram Mehta',     mobile: '9822001001', email: null, address: '15, Aundh Road, Pune',   driverIdx: 0 },
  { name: 'Shweta Joshi',     mobile: '9822001002', email: null, address: '28, Baner, Pune',         driverIdx: 0 },
  { name: 'Nikhil Shah',      mobile: '9822001003', email: null, address: '41, Pashan, Pune',        driverIdx: 0 },
  { name: 'Archana Kulkarni', mobile: '9822001004', email: null, address: '54, Sus Road, Pune',      driverIdx: 0 },
  { name: 'Prakash Nair',     mobile: '9822001005', email: null, address: '67, Wakad, Pune',         driverIdx: 0 },
  // Driver 2 (Sunil Patil)
  { name: 'Geeta Sharma',     mobile: '9822002001', email: null, address: '12, Kharadi, Pune',       driverIdx: 1 },
  { name: 'Rahul Desai',      mobile: '9822002002', email: null, address: '25, Magarpatta, Pune',    driverIdx: 1 },
  { name: 'Anjali Rao',       mobile: '9822002003', email: null, address: '38, Hadapsar, Pune',      driverIdx: 1 },
  { name: 'Suresh Iyer',      mobile: '9822002004', email: null, address: '51, Undri, Pune',         driverIdx: 1 },
  { name: 'Pooja Verma',      mobile: '9822002005', email: null, address: '64, NIBM, Pune',          driverIdx: 1 },
  // Driver 3 (Anil Sharma)
  { name: 'Manoj Bhosale',    mobile: '9822003001', email: null, address: '19, Chinchwad, Pune',     driverIdx: 2 },
  { name: 'Rekha Pawar',      mobile: '9822003002', email: null, address: '32, Pimpri, Pune',        driverIdx: 2 },
  { name: 'Sandeep Gupta',    mobile: '9822003003', email: null, address: '45, Akurdi, Pune',        driverIdx: 2 },
  { name: 'Kaveri Singh',     mobile: '9822003004', email: null, address: '58, Nigdi, Pune',         driverIdx: 2 },
  { name: 'Ravi Chavan',      mobile: '9822003005', email: null, address: '71, Bhosari, Pune',       driverIdx: 2 },
  // Driver 4 (Mahesh Jadhav)
  { name: 'Smita Tiwari',     mobile: '9822004001', email: null, address: '22, Warje, Pune',         driverIdx: 3 },
  { name: 'Dinesh Pillai',    mobile: '9822004002', email: null, address: '35, Karve Nagar, Pune',   driverIdx: 3 },
  { name: 'Usha Nambiar',     mobile: '9822004003', email: null, address: '48, Erandwane, Pune',     driverIdx: 3 },
  { name: 'Ketan Jain',       mobile: '9822004004', email: null, address: '61, Deccan, Pune',        driverIdx: 3 },
  { name: 'Meera Patil',      mobile: '9822004005', email: null, address: '74, Shivajinagar, Pune',  driverIdx: 3 },
  // Driver 5 (Vikram Singh)
  { name: 'Ashok Kulkarni',   mobile: '9822005001', email: null, address: '17, Kothrud, Pune',       driverIdx: 4 },
  { name: 'Priti Mehta',      mobile: '9822005002', email: null, address: '30, Bavdhan, Pune',       driverIdx: 4 },
  { name: 'Ganpat Rao',       mobile: '9822005003', email: null, address: '43, Pirangut, Pune',      driverIdx: 4 },
  { name: 'Sundar Joshi',     mobile: '9822005004', email: null, address: '56, Chandni Chowk, Pune', driverIdx: 4 },
  { name: 'Lalita Shah',      mobile: '9822005005', email: null, address: '69, Paud Road, Pune',     driverIdx: 4 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getWorkingDaysLast30() {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 30; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (d.getDay() !== 0) dates.push(d); // skip Sunday
  }
  return dates;
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting seed...');

  // ── 1. Clear existing data (FK order) ──────────────────────────────────────
  await prisma.inventoryLog.deleteMany();
  await prisma.bottleInventory.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.monthlyBill.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.client.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.user.deleteMany();
  console.log('🗑️  Cleared existing data');

  // ── 2. Admin user ───────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('Gajanan@123', 10);
  await prisma.user.create({
    data: {
      name: 'Admin',
      email: 'admin@gajananaqua.com',
      mobile: '0000000000',
      role: 'ADMIN',
      loginId: 'admin@gajananaqua.com',
      passwordHash: adminHash,
    },
  });
  console.log('👤 Admin user created (admin@gajananaqua.com / Gajanan@123)');

  // ── 3. Drivers ──────────────────────────────────────────────────────────────
  const driverPassword = await bcrypt.hash('driver123', 10);
  const driverRecords = [];

  for (const d of DRIVER_DEFS) {
    const user = await prisma.user.create({
      data: {
        name: d.name,
        mobile: d.mobile,
        role: 'DRIVER',
        loginId: d.loginId,
        passwordHash: driverPassword,
        driver: {
          create: {
            vehicleNumber: d.vehicleNumber,
            vehicleType: d.vehicleType,
            route: d.route,
          },
        },
      },
      include: { driver: true },
    });
    driverRecords.push({ ...d, driverId: user.driver.id, userId: user.id });
  }
  console.log(`🚛 Created ${driverRecords.length} drivers`);

  // ── 4. Clients ──────────────────────────────────────────────────────────────
  const clientRecords = [];

  const allClientDefs = [
    ...CLIENT_DEFS.map((c) => ({ ...c, bottleRange: [2, 5] })),
    ...ADDITIONAL_CLIENT_DEFS.map((c) => ({ ...c, bottleRange: [2, 4] })),
  ];

  for (const c of allClientDefs) {
    const driver = driverRecords[c.driverIdx];
    const client = await prisma.client.create({
      data: {
        name: c.name,
        mobile: c.mobile,
        email: c.email,
        address: c.address,
        assignedDriverId: driver.driverId,
        route: `Route ${driver.route}`,
        tempoNumber: driver.tempoLabel,
      },
    });
    clientRecords.push({ ...client, driverId: driver.driverId, userId: driver.userId, bottleRange: c.bottleRange });
  }
  console.log(`👥 Created ${clientRecords.length} clients`);

  // ── 5. Deliveries ───────────────────────────────────────────────────────────
  const workingDays = getWorkingDaysLast30();
  let totalDeliveries = 0;

  // Track per-client delivery data for invoices
  const clientDeliveryStats = {}; // clientId → { totalFilled, lastDeliveryId }

  for (const client of clientRecords) {
    let prevFilled = 0;
    clientDeliveryStats[client.id] = { totalFilled: 0, lastDeliveryId: null };

    for (const date of workingDays) {
      const [minBottles, maxBottles] = client.bottleRange ?? [2, 5];
      const filled = rand(minBottles, maxBottles);
      const empty = prevFilled; // collect what was delivered last time

      const delivery = await prisma.delivery.create({
        data: {
          clientId: client.id,
          driverId: client.driverId,
          userId: client.userId,
          deliveryDate: date,
          filledBottlesDelivered: filled,
          emptyBottlesCollected: empty,
          status: 'COMPLETED',
        },
      });

      clientDeliveryStats[client.id].totalFilled += filled;
      clientDeliveryStats[client.id].lastDeliveryId = delivery.id;
      prevFilled = filled;
      totalDeliveries++;
    }
  }
  console.log(`📦 Created ${totalDeliveries} delivery records`);

  // ── 6. Invoices ─────────────────────────────────────────────────────────────
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const amountPerBottle = 50;
  let invoiceCount = 0;

  for (let i = 0; i < clientRecords.length; i++) {
    const client = clientRecords[i];
    const stats = clientDeliveryStats[client.id];
    if (!stats.lastDeliveryId) continue;

    const totalBottles = stats.totalFilled;
    const totalAmount = totalBottles * amountPerBottle;
    const isPaid = i % 2 === 0; // alternate paid/unpaid
    const invoiceNumber = `INV-${year}-${month}-${client.id.slice(-6).toUpperCase()}`;

    await prisma.invoice.create({
      data: {
        clientId: client.id,
        deliveryId: stats.lastDeliveryId,
        invoiceNumber,
        bottlesTakenSinceLastPaid: totalBottles,
        amountPerBottle,
        totalAmount,
        isPaid,
        paidAt: isPaid ? new Date() : null,
        paymentQrData: `upi://pay?pa=watercan@paytm&pn=WaterSupply&am=${totalAmount}&tn=${invoiceNumber}`,
      },
    });
    invoiceCount++;
  }
  console.log(`🧾 Created ${invoiceCount} invoices (${Math.ceil(invoiceCount / 2)} paid, ${Math.floor(invoiceCount / 2)} unpaid)`);

  // ── 6. Bottle inventory ────────────────────────────────────────────────────
  await prisma.bottleInventory.create({
    data: {
      id:                 1,
      totalFilledBottles: 500,
      totalEmptyBottles:  120,
      updatedBy:          'admin',
    },
  });
  console.log('🍶 Bottle inventory initialised (500 filled, 120 empty)');

  console.log('');
  console.log('✅ Seed complete: ' + driverRecords.length + ' drivers, ' + clientRecords.length + ' clients, ~' + totalDeliveries + ' deliveries, ' + invoiceCount + ' invoices');
  console.log('   Admin login  → admin@gajananaqua.com / Gajanan@123');
  console.log('   Driver login → driver1–driver5 / driver123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());