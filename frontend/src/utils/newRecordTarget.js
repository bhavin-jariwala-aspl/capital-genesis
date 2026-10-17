/**
 * Where an object's "New" action goes.
 *
 * An object page always shows its records; creating one opens the object's staff
 * form. When the object has no staff form of its own — only wizard steps or a
 * public web form — a wizard is the only way to create a record, so "New"
 * launches the first wizard instead.
 *
 * `forms` undefined means the object's forms are not loaded yet: keep the form path.
 */
export function hasStaffCreateForm(forms) {
  return (forms || []).some((f) => ['create', 'edit'].includes(f.form_type) && f.is_active !== false && !f.config?.public?.enabled);
}

export function newRecordTarget({ forms, wizards = [], formPath }) {
  if (wizards.length && forms !== undefined && !hasStaffCreateForm(forms)) {
    return { path: `/wizard/${wizards[0].id}`, wizard: true };
  }
  return { path: formPath, wizard: false };
}
