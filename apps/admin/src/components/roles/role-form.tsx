import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { PermissionCatalog } from '@/components/roles/permission-catalog';
import { PresetPicker } from '@/components/roles/preset-picker';
import { createRole, updateRole, archiveRole, friendlyRoleError } from '@/lib/queries/roles';
import type { RoleView } from '@/lib/queries/roles';

interface RoleFormProps {
  readonly brandSlug: string;
  readonly isNew: boolean;
  readonly existingRole?: RoleView;
  readonly memberCount: number;
}

export function RoleForm({ brandSlug, isNew, existingRole, memberCount }: RoleFormProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [name, setName] = useState(existingRole?.role ?? '');
  const [nameError, setNameError] = useState('');
  const [permission, setPermission] = useState<Record<string, string[]>>(
    existingRole?.permission ?? {},
  );
  const [presetOpen, setPresetOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  const afterSuccess = () => {
    void qc.invalidateQueries({ queryKey: ['roles'] });
    void navigate({ to: '/$brandSlug/roles', params: { brandSlug } });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      if (isNew) {
        return createRole({ roleName: name.trim(), permission });
      }
      return updateRole(existingRole?.role ?? name.trim(), { permission, roleName: name.trim() });
    },
    onSuccess: (res) => {
      if (!res.ok) {
        const msg = friendlyRoleError(
          res.status,
          res.data as Record<string, string> | null,
          name.trim(),
        );
        if (res.status === 400 || res.status === 409) {
          setNameError(msg);
        } else {
          toast.error(msg);
        }
      } else {
        toast.success(isNew ? 'Role created.' : 'Role saved.');
        afterSuccess();
      }
    },
    onError: () => toast.error('Something went wrong. Please try again.'),
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveRole(existingRole?.role ?? name.trim()),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(
          friendlyRoleError(res.status, res.data as Record<string, string> | null, name.trim()),
        );
      } else {
        toast.success(`Role "${existingRole?.role ?? name}" archived.`);
        afterSuccess();
      }
    },
    onError: () => toast.error('Something went wrong. Please try again.'),
  });

  const validateName = (): boolean => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Role name is required.');
      return false;
    }
    if (trimmed.length > 64) {
      setNameError('Role name must be 64 characters or fewer.');
      return false;
    }
    setNameError('');
    return true;
  };

  const handleSave = () => {
    if (!validateName()) return;
    if (!isNew && memberCount >= 1) {
      setSaveDialogOpen(true);
    } else {
      saveMutation.mutate();
    }
  };

  const confirmSave = () => {
    setSaveDialogOpen(false);
    saveMutation.mutate();
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Role name</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-name">Role name</Label>
            <Input
              id="role-name"
              value={name}
              placeholder="e.g. Shift manager"
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError('');
              }}
              onBlur={validateName}
              aria-invalid={nameError !== '' ? true : undefined}
            />
            {nameError ? (
              <p className="text-destructive text-sm">{nameError}</p>
            ) : (
              <p className="text-muted-foreground text-sm">
                Must be unique. Reserved names (owner, admin, staff) are not allowed.
              </p>
            )}
          </div>
          {isNew && (
            <Button
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={() => {
                setPresetOpen(true);
              }}
            >
              Start from a preset
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
          <CardDescription>Select what members with this role can do.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <PermissionCatalog value={permission} onChange={setPermission} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saveMutation.isPending || archiveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving…' : isNew ? 'Create role' : 'Save role'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigate({ to: '/$brandSlug/roles', params: { brandSlug } });
            }}
          >
            Cancel
          </Button>
        </div>

        {!isNew && (
          <div className="flex flex-col items-end gap-1">
            {memberCount >= 1 ? (
              <>
                <Button variant="outline" size="sm" disabled className="text-destructive">
                  <Archive className="mr-1 size-4" />
                  Archive role
                </Button>
                <p className="text-destructive text-xs">
                  This role is assigned to {memberCount} member{memberCount === 1 ? '' : 's'}.
                  Reassign them before archiving.
                </p>
              </>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    disabled={archiveMutation.isPending}
                  >
                    <Archive className="mr-1 size-4" />
                    Archive role
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Archive &quot;{existingRole?.role ?? name}&quot;?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Archived roles cannot be assigned to new members. Members currently on this
                      role must already be reassigned.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={archiveMutation.isPending}
                      onClick={() => {
                        archiveMutation.mutate();
                      }}
                    >
                      {archiveMutation.isPending ? 'Archiving…' : 'Archive role'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update role permissions</AlertDialogTitle>
            <AlertDialogDescription>
              This will affect {memberCount} member{memberCount === 1 ? '' : 's'} immediately. Their
              access changes on the next request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={saveMutation.isPending} onClick={confirmSave}>
              Save changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PresetPicker
        open={presetOpen}
        onOpenChange={setPresetOpen}
        onSelect={({ name: presetName, permission: presetPermission }) => {
          setName(presetName);
          setPermission(presetPermission);
          if (nameError) setNameError('');
        }}
      />
    </div>
  );
}
