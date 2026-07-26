const prisma = require("../prisma/prisma");
const asyncErrorCatching = require("../utils/asyncErrorCatching");

exports.getSitemap = asyncErrorCatching(async (req, res, next) => {
    const isDev = process.env.NODE_ENV !== 'production';
    const domain = process.env.CLIENT_URL || (isDev ? 'http://127.0.0.1:3000' : 'https://www.modellink.com');

    const staticRoutes = [
        '', 
        '/about', 
        '/models', 
        '/contact', 
        '/policy', 
        '/directory'
    ];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Static routes
    staticRoutes.forEach(route => {
        xml += `  <url>\n`;
        xml += `    <loc>${domain}${route}</loc>\n`;
        xml += `    <changefreq>${route === '' ? 'daily' : 'monthly'}</changefreq>\n`;
        xml += `    <priority>${route === '' ? '1.0' : '0.8'}</priority>\n`;
        xml += `  </url>\n`;
    });

    // Dynamic routes from models
    const models = await prisma.aiModel.findMany({
        where: {
            status: 'PUBLISHED',
            deletedAt: null
        },
        select: {
            id: true,
            updatedAt: true
        }
    });

    if (models.length > 0) {
        models.forEach(model => {
            xml += `  <url>\n`;
            xml += `    <loc>${domain}/models/view/${model.id}</loc>\n`;
            if (model.updatedAt) {
                xml += `    <lastmod>${model.updatedAt.toISOString().split('T')[0]}</lastmod>\n`;
            }
            xml += `    <changefreq>monthly</changefreq>\n`;
            xml += `    <priority>0.9</priority>\n`;
            xml += `  </url>\n`;
        });
    }

    xml += `</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.status(200).send(xml);
});
