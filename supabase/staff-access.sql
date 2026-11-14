begin;

create table if not exists public.inventory_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  owner_id uuid not null references public.inventory_store(owner_id) on delete cascade,
  check (user_id <> owner_id)
);
alter table public.inventory_staff enable row level security;
revoke all on public.inventory_staff from public, anon, authenticated;

create or replace function public.inventory_staff_read()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'revision', store.revision,
    'snapshot', jsonb_build_object(
      'products', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p->'id', 'name', p->'name', 'branchId', p->'branchId',
          'sku', p->'sku', 'barcode', p->'barcode',
          'vietnamesePrice', coalesce(p->'vietnamesePrice', p->'retailPrice'),
          'internationalPrice', coalesce(p->'internationalPrice', p->'wholesalePrice')
        ))
        from jsonb_array_elements(store.snapshot->'products') p
        where p->>'deletedAt' is null
      ), '[]'::jsonb),
      'sales', coalesce((
        select jsonb_agg(s - 'stockQuantities')
        from jsonb_array_elements(store.snapshot->'sales') s
        where s->>'staffId' = auth.uid()::text
      ), '[]'::jsonb),
      'purchases', '[]'::jsonb
    )
  )
  from public.inventory_staff staff
  join public.inventory_store store on store.owner_id = staff.owner_id
  where staff.user_id = auth.uid() and store.snapshot is not null;
$$;

create or replace function public.inventory_staff_checkout(order_data jsonb)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  store_owner uuid;
  data jsonb;
  products jsonb;
  order_items jsonb := '[]'::jsonb;
  stock_changes jsonb := '{}'::jsonb;
  line jsonb;
  product jsonb;
  product_key text;
  branch text := order_data->>'branchId';
  unit text := order_data->>'currency';
  order_id uuid := (order_data->>'id')::uuid;
  payment text := order_data->>'paymentMethod';
  discount_type text := order_data->>'discountType';
  discount_value numeric := (order_data->>'discountValue')::numeric;
  discount numeric;
  qty integer;
  price numeric;
  subtotal numeric := 0;
  units bigint := 0;
  remaining bigint;
  precision_digits integer := case when unit = 'USD' then 2 else 0 end;
  product_index integer;
  saved_order jsonb;
begin
  select owner_id into store_owner from public.inventory_staff where user_id = auth.uid();
  if not found then raise exception 'Tài khoản chưa được cấp quyền bán hàng.'; end if;

  select snapshot into data from public.inventory_store where owner_id = store_owner for update;
  if data is null then raise exception 'Kho chung chưa được khởi tạo.'; end if;
  if order_id is null or branch is null or branch not in ('ha-noi', 'ninh-binh')
    or unit is null or unit not in ('VND', 'USD')
    or payment is null or payment not in ('cash', 'transfer', 'unknown')
    or jsonb_typeof(order_data->'items') is distinct from 'array'
    or jsonb_array_length(order_data->'items') not between 1 and 200 then
    raise exception 'Thông tin đơn không hợp lệ.';
  end if;
  if exists (select 1 from jsonb_array_elements(data->'sales') s where s->>'id' = order_id::text) then
    if exists (select 1 from jsonb_array_elements(data->'sales') s
      where s->>'id' = order_id::text and s->>'staffId' = auth.uid()::text) then return true; end if;
    raise exception 'Mã đơn đã tồn tại.';
  end if;

  products := data->'products';
  for line in select value from jsonb_array_elements(order_data->'items') loop
    qty := (line->>'qty')::integer;
    price := (line->>'price')::numeric;
    if qty is null or qty < 1 or price is null or price < 0
      or price > 90071992547409 or price <> round(price, precision_digits)
      or coalesce(btrim(line->>'name'), '') = ''
      or coalesce(line->>'priceTier', '') not in ('vietnamese', 'international') then
      raise exception 'Dòng sản phẩm không hợp lệ.';
    end if;
    product_key := nullif(line->>'productId', '');
    if product_key is not null then
      select p.value, (p.ordinality - 1)::integer into product, product_index
        from jsonb_array_elements(products) with ordinality p
        where p.value->>'id' = product_key and p.value->>'deletedAt' is null
          and coalesce(p.value->>'branchId', case when product_key like 'sapo-product-%'
            then 'ninh-binh' else 'ha-noi' end) = branch;
      if not found then raise exception 'Sản phẩm không còn bán tại chi nhánh này.'; end if;
      if jsonb_typeof(product->'stock') = 'number' then
        remaining := (product->>'stock')::bigint - qty;
        if remaining < 0 then raise exception 'Không thể bán số lượng đã chọn.'; end if;
        products := jsonb_set(products, array[product_index::text, 'stock'], to_jsonb(remaining));
        stock_changes := jsonb_set(stock_changes, array[product_key],
          to_jsonb(coalesce((stock_changes->>product_key)::bigint, 0) + qty));
      end if;
    end if;
    order_items := order_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'name', case when product_key is null then line->>'name' else product->>'name' end,
      'productId', product_key, 'qty', qty, 'price', price, 'priceTier', line->>'priceTier'
    )));
    subtotal := subtotal + price * qty;
    units := units + qty;
  end loop;
  if subtotal > 90071992547409 or discount_value is null or discount_value < 0 then
    raise exception 'Tổng tiền hoặc giảm giá không hợp lệ.';
  end if;
  case discount_type
    when 'percent' then
      if discount_value > 100 or discount_value <> round(discount_value, 2) then raise exception 'Giảm giá không hợp lệ.'; end if;
      discount := round(subtotal * discount_value / 100, precision_digits);
    when 'amount' then
      if discount_value > subtotal or discount_value <> round(discount_value, precision_digits) then raise exception 'Giảm giá không hợp lệ.'; end if;
      discount := discount_value;
    else raise exception 'Giảm giá không hợp lệ.';
  end case;

  saved_order := jsonb_build_object(
    'id', order_id, 'staffId', auth.uid(), 'branchId', branch, 'currency', unit,
    'createdAt', now(), 'status', 'paid', 'items', order_items, 'qty', units,
    'total', subtotal - discount, 'discountType', discount_type, 'discountValue', discount_value,
    'discountAmount', discount, 'paymentMethod', payment, 'stockQuantities', stock_changes
  );
  update public.inventory_store
  set snapshot = data || jsonb_build_object(
    'products', products, 'sales', jsonb_build_array(saved_order) || (data->'sales')
  ), revision = revision + 1
  where owner_id = store_owner;
  return true;
end;
$$;

revoke all on function public.inventory_staff_read() from public, anon, authenticated;
revoke all on function public.inventory_staff_checkout(jsonb) from public, anon, authenticated;
grant execute on function public.inventory_staff_read() to authenticated;
grant execute on function public.inventory_staff_checkout(jsonb) to authenticated;

commit;

-- Create a separate confirmed user in Authentication > Users, then assign them:
-- insert into public.inventory_staff (user_id, owner_id)
-- select employee.id, store.owner_id
-- from auth.users employee cross join auth.users owner_account
-- join public.inventory_store store on store.owner_id = owner_account.id
-- where lower(employee.email) = lower('employee@example.com')
--   and lower(owner_account.email) = lower('owner@example.com')
--   and not exists (select 1 from public.inventory_store own_store where own_store.owner_id = employee.id)
-- returning user_id;
