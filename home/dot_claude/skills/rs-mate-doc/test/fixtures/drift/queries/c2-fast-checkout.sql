select count(*) as orders
from orders
where checkout_path = 'fast';
