import { Body, Controller, HttpException, Inject, Post } from '@nestjs/common';
import { parseRequestSchema, type ParseIntentResponse } from '@acenote/contracts';
import { DeepSeekParser } from './deepseek-parser';

@Controller('v1/parse')
export class ParseController {
  constructor(@Inject(DeepSeekParser) private readonly parser: DeepSeekParser) {}

  @Post()
  async parse(@Body() body: unknown): Promise<ParseIntentResponse> {
    const request = parseRequestSchema.safeParse(body);
    if (!request.success) throw new HttpException({ code: 'INVALID_INPUT', message: 'Invalid parse request' }, 400);
    return { requestId: request.data.requestId, result: await this.parser.parse(request.data) };
  }
}
