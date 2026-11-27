import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller({
  path: 'health',
  version: '1',
})
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Service liveness check' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean', example: true },
        status: { type: 'string', example: 'up' },
        timestamp: { type: 'string', example: '2026-11-27T12:00:00.000Z' },
      },
    },
  })
  check() {
    return {
      ok: true,
      status: 'up',
      timestamp: new Date().toISOString(),
    };
  }
}
