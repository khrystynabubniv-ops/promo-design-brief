import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json(
    {
      error:
        'Google Docs export helper не налаштований у цьому застосунку. У репозиторії є Notion API, але немає Google Drive/Docs runtime-конектора або credentials.',
    },
    { status: 501 },
  );
}
