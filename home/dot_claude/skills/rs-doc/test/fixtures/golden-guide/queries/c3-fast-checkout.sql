select count(*) as orders
from orders
where checkout_path = 'fast'
  and created_at >= dateadd(day, -7, current_date);
