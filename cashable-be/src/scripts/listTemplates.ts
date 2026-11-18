import '../config/loadEnv';
import prisma from '../config/prismaClient';
(async () => {
  const rows = await prisma.boldSignTemplate.findMany({
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: { name: true, type: true, layoutKey: true, pdfUrl: true },
  });
  for (const r of rows) {
    console.log(r.type, '|', r.layoutKey, '|', String(r.pdfUrl || '').slice(0, 100));
  }
  await prisma.$disconnect();
})();
