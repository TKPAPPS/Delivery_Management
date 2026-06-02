import type { createSupabaseAdminClient } from './supabase-server';

/**
 * App-wide settings stored in the `app_settings` key/value table.
 * Missing keys read as their safe default so absence never changes behaviour.
 */

const LINE_MASTER_KEY = 'line_master_enabled';

// Match the codebase's (untyped) admin client rather than SupabaseClient<Database>,
// which the project's manually-maintained schema type doesn't fully satisfy.
type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Master switch for automatic LINE notifications. Defaults to enabled (missing row/error → true). */
export async function getLineMasterEnabled(supabase: Admin): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', LINE_MASTER_KEY)
      .maybeSingle();
    if (!data) return true; // unconfigured → enabled
    return (data.value as { enabled?: boolean }).enabled !== false;
  } catch {
    return true; // never let a settings hiccup silently drop notifications
  }
}

/** Upsert the master switch. */
export async function setLineMasterEnabled(supabase: Admin, enabled: boolean, userId: string): Promise<void> {
  await supabase.from('app_settings').upsert({
    key: LINE_MASTER_KEY,
    value: { enabled },
    updated_at: new Date().toISOString(),
    updated_by: userId,
  });
}
