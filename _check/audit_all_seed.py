import random
from datetime import date, datetime, timedelta

random.seed(5)
today = date.today()
expenses = []
for offset in range(40, -1, -1):
    day = today - timedelta(days=offset)
    for n in range(random.choice([1, 2, 3])):
        desc, cat = random.choice([("Lunch", "Food"), ("Grab", "Transport"), ("Pxmart", "Groceries"), ("Netflix", "Bills"), ("Uniqlo", "Shopping")])
        when = datetime(day.year, day.month, day.day, random.choice([9, 13, 19]), 5)
        expenses.append({"id": f"s{offset}-{n}", "created": int(when.timestamp() * 1000), "date": day.isoformat(),
                         "desc": desc, "cat": cat, "amount": random.randint(40, 900), "note": "", "raw": f"{desc} 100"})


