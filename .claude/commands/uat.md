---
description: Run user acceptance testing for the Skånetrafiken extension
---

Run automated UAT for the Skånetrafiken delay compensation extension.

Navigate to https://www.skanetrafiken.se/, fill out journey search form (Malmö Hyllie → CPH Airport Kastrup), and look for eligible cancelled journeys with 20+ minute delays that should show compensation buttons.

Test procedure:
1. Navigate to Skånetrafiken website
2. Fill journey search form with test route
3. Click "Se tidigare resor" up to 10 times to find cancelled journeys
4. Verify extension adds compensation buttons for eligible delays
5. Check browser console for extension activity logs

Expected result: Extension should automatically detect cancelled journeys with 20+ minute delays and add red "Begär ersättning" buttons.