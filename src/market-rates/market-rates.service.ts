import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMarketRateDto } from './dto/create-market-rate.dto';
import { UpdateMarketRateDto } from './dto/update-market-rate.dto';

@Injectable()
export class MarketRatesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createMarketRateDto: CreateMarketRateDto) {
    const currency = await this.prisma.currency.findUnique({
      where: { id: createMarketRateDto.currencyId },
    });

    if (!currency) {
      throw new NotFoundException(
        `No se encontró la moneda con id ${createMarketRateDto.currencyId}`,
      );
    }

    return this.prisma.marketRate.create({
      data: {
        currencyId: createMarketRateDto.currencyId,
        rateToCOP: createMarketRateDto.rateToCOP,
        source: createMarketRateDto.source,
      },
      include: {
        currency: true,
      },
    });
  }

  async findAll() {
    return this.prisma.marketRate.findMany({
      include: {
        currency: true,
      },
      orderBy: {
        id: 'desc',
      },
    });
  }

  async findOne(id: number) {
    const marketRate = await this.prisma.marketRate.findUnique({
      where: { id },
      include: {
        currency: true,
      },
    });

    if (!marketRate) {
      throw new NotFoundException(`No se encontró la tasa con id ${id}`);
    }

    return marketRate;
  }

  async findLatestByCurrency(currencyId: number) {
    const marketRate = await this.prisma.marketRate.findFirst({
      where: { currencyId },
      include: {
        currency: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!marketRate) {
      throw new NotFoundException(
        `No se encontró ninguna tasa para la moneda con id ${currencyId}`,
      );
    }

    return marketRate;
  }

  async getEffectiveRate(currencyId: number) {
    const latest = await this.findLatestByCurrency(currencyId);

    const percent = latest.currency.defaultOperationalPercent || 0;
    const effectiveRate = Number(
      (latest.rateToCOP * (1 - percent / 100)).toFixed(2),
    );

    return {
      currency: latest.currency.code,
      marketRate: latest.rateToCOP,
      operationalPercent: percent,
      effectiveRate,
      source: latest.source,
      updatedAt: latest.createdAt,
    };
  }

  async update(id: number, updateMarketRateDto: UpdateMarketRateDto) {
    await this.findOne(id);

    if (updateMarketRateDto.currencyId !== undefined) {
      const currency = await this.prisma.currency.findUnique({
        where: { id: updateMarketRateDto.currencyId },
      });

      if (!currency) {
        throw new NotFoundException(
          `No se encontró la moneda con id ${updateMarketRateDto.currencyId}`,
        );
      }
    }

    return this.prisma.marketRate.update({
      where: { id },
      data: {
        ...(updateMarketRateDto.currencyId !== undefined && {
          currencyId: updateMarketRateDto.currencyId,
        }),
        ...(updateMarketRateDto.rateToCOP !== undefined && {
          rateToCOP: updateMarketRateDto.rateToCOP,
        }),
        ...(updateMarketRateDto.source !== undefined && {
          source: updateMarketRateDto.source,
        }),
      },
      include: {
        currency: true,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.marketRate.delete({
      where: { id },
    });
  }
}
