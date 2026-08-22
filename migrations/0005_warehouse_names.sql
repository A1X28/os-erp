-- "Транзит" was a demo warehouse in Astana and looked like "товар в пути".
update warehouses
  set name = 'Склад Астана'
  where code = 'TRANS' and name = 'Транзит';
