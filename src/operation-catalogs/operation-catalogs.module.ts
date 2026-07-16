import { Module } from '@nestjs/common';
import { OperationCatalogsController } from './operation-catalogs.controller';

@Module({ controllers: [OperationCatalogsController] })
export class OperationCatalogsModule {}
