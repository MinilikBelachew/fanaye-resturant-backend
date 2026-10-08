import { PartialType } from '@nestjs/swagger';
import { CatalogCreateMenuItemDto } from './create-menu-item.dto';

export class CatalogUpdateMenuItemDto extends PartialType(CatalogCreateMenuItemDto) {}
