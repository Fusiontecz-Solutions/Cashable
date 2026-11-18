import '../config/loadEnv';
import prisma from '../config/prismaClient';
(async () => {
  const r = await prisma.boldSignTemplate.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { pdfUrl: true },
  });
  const url = String(r?.pdfUrl || '');
  console.log('URL tail:', url.slice(-50));
  const res = await fetch(url);
  console.log('status:', res.status, '| x-cld-error:', res.headers.get('x-cld-error') || 'none');
  await prisma.$disconnect();
})();
