import { redirect } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { apiFetch } from '@/lib/api-server';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { GroupEditorShellClient, type ModifierGroupDetailApi } from './group-editor-shell-client';

interface MeResponse {
  readonly kind?: string;
  readonly tenantId?: string;
}

interface GroupEditorPageProps {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function GroupEditorPage(
  props: GroupEditorPageProps,
): Promise<React.ReactElement> {
  const me = await apiFetch<MeResponse>('/v1/me');
  if (!me.ok || me.data?.kind !== 'operator' || !me.data.tenantId) {
    redirect('/login');
  }

  const params = await props.params;
  const isNew = params.id === 'new';

  if (isNew) {
    return <GroupEditorShellClient initialGroup={null} groupId="new" />;
  }

  const res = await apiFetchInternal<ModifierGroupDetailApi>(
    `/internal/v1/catalog/modifier-groups/${params.id}`,
  );
  if (res.status === 404 || !res.ok || !res.data) {
    return (
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <EmptyState
          variant="empty"
          title="Группа не найдена"
          description="Возможно, она была удалена."
        />
      </div>
    );
  }

  return <GroupEditorShellClient initialGroup={res.data} groupId={params.id} />;
}
