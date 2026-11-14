begin;
alter table public.inventory_staff add column if not exists branch_id text
  check (branch_id in ('ha-noi', 'ninh-binh'));

create or replace function public.inventory_staff_list()
returns table(user_id uuid, display_name text, branch_id text)
language sql stable security definer set search_path = ''
as $$
  select s.user_id, s.display_name, s.branch_id
  from public.inventory_staff s where s.owner_id = auth.uid()
  order by s.display_name, s.user_id;
$$;

create or replace function public.inventory_staff_assign(employee_id uuid, target_branch text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare store_owner uuid;
begin
  if target_branch is null or target_branch not in ('ha-noi', 'ninh-binh') then
    raise exception 'Chi nhánh không hợp lệ.';
  end if;
  select owner_id into store_owner from public.inventory_staff
    where user_id = employee_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Không có quyền quản lý nhân viên này.'; end if;
  update public.inventory_staff set branch_id = target_branch where user_id = employee_id;
  update public.inventory_store set revision = revision + 1 where owner_id = store_owner;
  return true;
end;
$$;

create or replace function public.inventory_staff_read()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('revision', store.revision, 'branchId', staff.branch_id,
    'snapshot', jsonb_build_object(
      'products', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p->'id', 'name', p->'name', 'branchId', staff.branch_id,
          'sku', p->'sku', 'barcode', p->'barcode',
          'vietnamesePrice', coalesce(p->'vietnamesePrice', p->'retailPrice'),
          'internationalPrice', coalesce(p->'internationalPrice', p->'wholesalePrice')
        )) from jsonb_array_elements(store.snapshot->'products') p
        where p->>'deletedAt' is null and coalesce(p->>'branchId',
          case when p->>'id' like 'sapo-product-%' then 'ninh-binh' else 'ha-noi' end) = staff.branch_id
      ), '[]'::jsonb),
      'sales', coalesce((
        select jsonb_agg(s - 'stockQuantities') from jsonb_array_elements(store.snapshot->'sales') s
        where s->>'staffId' = auth.uid()::text and coalesce(s->>'branchId','ha-noi') = staff.branch_id
      ), '[]'::jsonb), 'purchases', '[]'::jsonb))
  from public.inventory_staff staff join public.inventory_store store on store.owner_id = staff.owner_id
  where staff.user_id = auth.uid() and store.snapshot is not null;
$$;

-- Add the branch guard to the existing checkout without changing its stock calculations.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.inventory_staff_checkout(jsonb)'::regprocedure);
  if position('Nhân viên chỉ được bán tại chi nhánh được gán.' in definition) = 0 then
    if definition !~ E'\nbegin\n' then raise exception 'Không tìm thấy phần thân hàm thanh toán.'; end if;
    definition := replace(definition, E'\nbegin\n', E'\nbegin\n'
      || '  perform 1 from public.inventory_staff where user_id = auth.uid() and branch_id = branch for share;' || E'\n'
      || '  if not found then raise exception ''Nhân viên chỉ được bán tại chi nhánh được gán.''; end if;' || E'\n');
    execute definition;
  end if;
end;
$migration$;

revoke all on function public.inventory_staff_list() from public, anon, authenticated;
revoke all on function public.inventory_staff_assign(uuid,text) from public, anon, authenticated;
grant execute on function public.inventory_staff_list() to authenticated;
grant execute on function public.inventory_staff_assign(uuid,text) to authenticated;
commit;
