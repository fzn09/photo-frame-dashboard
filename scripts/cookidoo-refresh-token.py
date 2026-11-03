"""Print a Cookidoo refresh token for the dashboard Worker (dashboard/SETUP.md, Cookidoo meals).

Needs `pip install cookidoo-api` and EMAIL / PASSWORD in the environment. The token is a credential:
the script prints it to stdout only. Do not save it in the repo.
"""
import asyncio
import os
import sys

from aiohttp import ClientSession, CookieJar
from cookidoo_api import Cookidoo, CookidooConfig, CookidooLocalizationConfig

HOST = os.environ.get("COOKIDOO_HOST", "cookidoo.de")
LANG = os.environ.get("COOKIDOO_LANG", "de-DE")


async def main() -> int:
    email, password = os.environ.get("EMAIL"), os.environ.get("PASSWORD")
    if not email or not password:
        print("Set EMAIL and PASSWORD", file=sys.stderr)
        return 1
    async with ClientSession(cookie_jar=CookieJar(unsafe=True)) as session:
        cookidoo = Cookidoo(
            session,
            cfg=CookidooConfig(
                email=email,
                password=password,
                localization=CookidooLocalizationConfig(
                    country_code=HOST.rsplit(".", 1)[-1],
                    language=LANG,
                    url=f"https://{HOST}/foundation/{LANG}",
                ),
            ),
        )
        await cookidoo.login()
        print(cookidoo.auth_data.refresh_token)
    return 0


sys.exit(asyncio.run(main()))
