import { createFileRoute } from '@tanstack/react-router';

import { PortfolioExposure } from '@/features/finance/portfolio-exposure';

export const Route = createFileRoute('/_authenticated/exposure')({ component: PortfolioExposure });
