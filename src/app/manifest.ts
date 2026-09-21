import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RabbitFlow - Agile Project Management',
    short_name: 'RabbitFlow',
    description: 'Agile planning, delivery, and reporting for accountable teams.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f7fbfc',
    theme_color: '#087d86',
    icons: [
      {
        src: '/brand/rabbitflow-mark.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
