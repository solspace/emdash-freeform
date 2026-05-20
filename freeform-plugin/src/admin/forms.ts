import type { PluginContext } from "emdash";
import { ALL_FIELD_TYPES, FREE_FIELD_TYPES } from "../constants";
import { ensureFormHandle } from "../lib/form-handles";
import { getTier } from "../lib/license";
import { effectiveSpamSettings, getSpamSettings } from "../lib/spam-settings";
import type {
	StoredAssignment,
	StoredForm,
	StoredSubmission,
	StoredTemplate,
} from "../types";

function shortDate(iso: string): string {
	return new Date(iso).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

// `confirmDelId`: form id currently in the inline "are you sure" state. We
// don't use Block Kit's `confirm:` modal because its CSS is owned upstream and
// we have no hook to override it from the plugin. Two-step inline pattern is
// the workaround until EmDash fixes the modal padding.
export async function listPageBlocks(
	ctx: PluginContext,
	confirmDelId?: string,
): Promise<object[]> {
	const tier = await getTier(ctx);
	const { items: forms } = await ctx.storage.forms.query({
		orderBy: { createdAt: "desc" },
	});
	const totalSubs = await ctx.storage.submissions.count();
	const formItems = forms as Array<{ id: string; data: StoredForm }>;

	const { items: allSubs } = await ctx.storage.submissions.query({
		limit: 10000,
	});
	const subCountMap = new Map<string, number>();
	for (const s of allSubs as Array<{ id: string; data: StoredSubmission }>) {
		subCountMap.set(s.data.formId, (subCountMap.get(s.data.formId) ?? 0) + 1);
	}

	// Backfill handles for any forms created before the `handle` field existed.
	for (const f of formItems) {
		if (!f.data.handle) f.data = await ensureFormHandle(ctx, f.id, f.data);
	}

	const formBlocks =
		formItems.length === 0
			? [
					{
						type: "empty",
						title: "No forms yet",
						description:
							"Create your first form to start collecting submissions.",
						size: "lg",
						actions: [
							{
								type: "button",
								label: "+ New Form",
								action_id: "new_form",
								style: "primary",
							},
						],
					},
				]
			: formItems.flatMap((f) => {
					const fieldCount = f.data.rows.reduce(
						(n, r) => n + r.fields.length,
						0,
					);
					const subCount = subCountMap.get(f.id) ?? 0;
					const isConfirming = f.id === confirmDelId;
					const rightColumn = isConfirming
						? [
								{
									type: "section",
									text: `⚠ Delete "${f.data.name}"? All ${subCount} submission${subCount === 1 ? "" : "s"} will also be permanently deleted.`,
								},
								{
									type: "actions",
									elements: [
										{
											type: "button",
											label: "Confirm delete",
											action_id: `confirm_del:${f.id}`,
											style: "danger",
										},
										{
											type: "button",
											label: "Cancel",
											action_id: `cancel_del:${f.id}`,
										},
									],
								},
							]
						: [
								{
									type: "actions",
									elements: [
										{
											type: "button",
											label: "Edit",
											action_id: `edit:${f.id}`,
											style: "primary",
										},
										{
											type: "button",
											label: "Submissions",
											action_id: `subs:${f.id}`,
										},
										{
											type: "button",
											label: "Delete",
											action_id: `del:${f.id}`,
											style: "danger",
										},
									],
								},
							];
					return [
						{
							type: "columns",
							columns: [
								[
									{ type: "section", text: `${f.data.name}` },
									{
										type: "fields",
										fields: [
											{ label: "Fields", value: String(fieldCount) },
											{ label: "Submissions", value: String(subCount) },
											{ label: "Updated", value: shortDate(f.data.updatedAt) },
										],
									},
								],
								rightColumn,
							],
						},
						{ type: "divider" },
					];
				});

	return [
		{ type: "header", text: "Freeform" },
		{
			type: "stats",
			items: [
				{
					label: "Forms",
					value: String(formItems.length),
					description: "active forms",
				},
				{
					label: "Submissions",
					value: String(totalSubs),
					description: "all time",
				},
				{ label: "Plan", value: tier === "pro" ? "Pro ✓" : "Free" },
			],
		},
		tier === "free"
			? {
					type: "banner",
					title: "Free Plan",
					description:
						"Email fields are locked. Add a license key in Settings to unlock Pro features.",
					variant: "default",
				}
			: {
					type: "banner",
					title: "Pro Plan Active",
					description: "All field types and features are unlocked.",
					variant: "default",
				},
		{
			type: "actions",
			elements: [
				{
					type: "button",
					label: "+ New Form",
					action_id: "new_form",
					style: "primary",
				},
				{ type: "button", label: "⚙ Settings", action_id: "nav:settings" },
			],
		},
		{ type: "divider" },
		...formBlocks,
	];
}

export async function editorBlocks(
	formId: string,
	ctx: PluginContext,
	showAddField = false,
): Promise<object[]> {
	const tier = await getTier(ctx);
	let formData = (await ctx.storage.forms.get(formId)) as StoredForm | null;

	if (!formData) {
		return [
			{ type: "banner", title: "Form not found", variant: "error" },
			{
				type: "actions",
				elements: [{ type: "button", label: "← Back", action_id: "nav:forms" }],
			},
		];
	}

	if (!formData.handle)
		formData = await ensureFormHandle(ctx, formId, formData);

	const flatFields = formData.rows.flatMap((row) => row.fields);

	// ── Form preview ──────────────────────────────────────────────────────────
	// Renders each row as a `fields` block (key = label+required, value = type +
	// placeholder / option count). Rows with multiple fields show them side by
	// side, matching the actual rendered form layout.
	const previewBlocks: object[] =
		formData.rows.length === 0
			? [
					{
						type: "empty",
						title: "No fields yet",
						description:
							'Use the AI prompt below to build your form. Try: "Add a contact form with name, email, and a message field."',
						size: "base",
					},
				]
			: formData.rows.flatMap((row) => {
					const fieldItems = row.fields.map((f) => {
						const labelText = `${f.type === "email" && tier === "free" ? "🔒 " : ""}${f.label}${f.required ? " *" : ""}`;
						let valueText = f.type;
						if (f.placeholder) valueText += ` — "${f.placeholder}"`;
						else if (f.options && f.options.length > 0)
							valueText += ` — ${f.options.map((o) => o.label).join(", ")}`;
						else if (f.type === "checkbox")
							valueText +=
								f.defaultValue === "true" ? " — checked by default" : "";
						return { label: labelText, value: valueText };
					});
					return [{ type: "fields", fields: fieldItems }];
				});

	return [
		{ type: "header", text: `Editing: ${formData.name}` },
		{
			type: "actions",
			elements: [
				{ type: "button", label: "← Back to Forms", action_id: "nav:forms" },
			],
		},
		{
			type: "context",
			text: `Reference this form in templates with: <FreeformForm formId="${formData.handle}" />`,
		},
		{ type: "divider" },

		// ── Form settings ───────────────────────────────────────────────────────
		{
			type: "form",
			block_id: "form_meta",
			fields: [
				{
					type: "text_input",
					action_id: "label",
					label: "Form Name",
					initial_value: formData.name,
				},
				{
					type: "text_input",
					action_id: "handle",
					label: "Handle (stable reference key)",
					initial_value: formData.handle,
					placeholder: "contact_us",
				},
				{
					type: "text_input",
					action_id: "success_message",
					label: "Success message",
					initial_value: formData.successMessage ?? "",
					placeholder: "Thank you for your submission!",
				},
			],
			submit: { label: "Save Settings", action_id: `save_meta:${formId}` },
		},
		{ type: "divider" },

		// ── Form preview ────────────────────────────────────────────────────────
		{ type: "header", text: "Form Preview" },
		...previewBlocks,
		{ type: "divider" },

		// ── AI Form Builder ─────────────────────────────────────────────────────
		{ type: "header", text: "✨ AI Form Builder" },
		{
			type: "section",
			text: "Use natural language to build and modify this form. You can add, remove, rename, or reorder fields — just describe what you want.",
		},
		{
			type: "context",
			text:
				'Examples: "Add name, email, and a message field" · "Make email required" · ' +
				'"Move the phone field after email" · "Remove the budget field" · ' +
				(tier === "free" ? '"Email field type requires Pro." · ' : "") +
				'"Add a country dropdown with US, UK, Canada, Australia"',
		},
		{
			type: "form",
			block_id: "ai_gen",
			fields: [
				{
					type: "text_input",
					action_id: "description",
					label: "What should the AI do?",
					placeholder: 'e.g. "Add a phone field after email, make it optional"',
				},
			],
			submit: { label: "✨ Apply with AI", action_id: `ai:${formId}` },
		},
		{ type: "divider" },

		// ── Manual field controls ────────────────────────────────────────────────
		{ type: "header", text: "Field Controls" },
		...(flatFields.length > 0
			? [
					{
						type: "form",
						block_id: "remove_field",
						fields: [
							{
								type: "select",
								action_id: "field_id",
								label: "Remove a field",
								options: flatFields.map((f) => ({
									label: `${f.label} (${f.type})`,
									value: f.id,
								})),
							},
						],
						submit: {
							label: "Remove",
							action_id: `rm_field:${formId}`,
							style: "danger",
						},
					},
				]
			: []),
		...(showAddField
			? [
					{ type: "divider" },
					{ type: "header", text: "Add Field" },
					...(tier === "free"
						? [
								{
									type: "context",
									text: "Email fields require Pro. Add a license key in Settings to unlock them.",
								},
							]
						: []),
					{
						type: "form",
						block_id: "add_field",
						fields: [
							{
								type: "select",
								action_id: "field_type",
								label: "Field Type",
								options: (tier === "pro"
									? ALL_FIELD_TYPES
									: FREE_FIELD_TYPES
								).map((t) => ({
									label:
										t
											.replace(/_/g, " ")
											.replace(/\b\w/g, (c) => c.toUpperCase()),
									value: t,
								})),
								initial_value: "text",
							},
							{
								type: "text_input",
								action_id: "field_label",
								label: "Label",
								placeholder: "e.g. First Name",
							},
							{
								type: "text_input",
								action_id: "field_handle",
								label: "Handle (optional)",
								placeholder: "auto-derived from label",
							},
							{
								type: "text_input",
								action_id: "field_options",
								label: "Options (for radio, select, multi_select, checkbox_group)",
								placeholder: "us: United States, ca: Canada, mx: Mexico",
							},
						{
							type: "text_input",
							action_id: "field_default",
							label: "Default value",
							placeholder:
								"checkbox: 'true' · multi: comma-sep values · html: paste HTML content · hidden: fixed submitted value",
						},
						{
							type: "toggle",
							action_id: "field_required",
							label: "Required",
							initial_value: false,
						},
						{
							type: "text_input",
							action_id: "field_min_length",
							label: "Min length (text, email, textarea, phone — optional)",
							placeholder: "e.g. 2",
						},
						{
							type: "text_input",
							action_id: "field_max_length",
							label: "Max length (text, email, textarea, phone — optional)",
							placeholder: "e.g. 255",
						},
						{
							type: "text_input",
							action_id: "field_pattern",
							label: "Validation pattern (text fields — optional regex)",
							placeholder: "e.g. [A-Za-z]+ for letters only",
						},
						{
							type: "text_input",
							action_id: "field_pattern_error",
							label: "Pattern mismatch message (optional)",
							placeholder: "e.g. Letters only, no spaces",
						},
						{
							type: "text_input",
							action_id: "field_min",
							label: "Min value or date (number/date — optional)",
							placeholder: "number: 0 · date: 2026-01-01",
						},
						{
							type: "text_input",
							action_id: "field_max",
							label: "Max value or date (number/date — optional)",
							placeholder: "number: 100 · date: 2099-12-31",
						},
						{
							type: "select",
							action_id: "field_row",
							label: "Add to row",
								options: [
									{ label: "New row at the end", value: "new" },
									...formData.rows.map((r, i) => ({
										label: `Row ${i + 1} — alongside: ${r.fields.map((f) => f.label).join(", ")}`,
										value: r.id,
									})),
								],
								initial_value: "new",
							},
						],
						submit: {
							label: "Add Field",
							action_id: `add:${formId}`,
						},
					},
					{
						type: "actions",
						elements: [
							{
								type: "button",
								label: "Cancel",
								action_id: `cancel_add:${formId}`,
							},
						],
					},
				]
			: [
					{
						type: "actions",
						elements: [
							{
								type: "button",
								label: "+ Add Field",
								action_id: `show_add:${formId}`,
								style: "primary",
							},
						],
					},
				]),
		{ type: "divider" },

		// ── Spam filter ─────────────────────────────────────────────────────────
		...(await spamForFormBlocks(formId, formData, tier, ctx)),
		{ type: "divider" },

		// ── Notifications ───────────────────────────────────────────────────────
		...(await notificationsForFormBlocks(formId, ctx)),
	];
}

async function spamForFormBlocks(
	formId: string,
	form: StoredForm,
	tier: "free" | "pro",
	ctx: PluginContext,
): Promise<object[]> {
	const header = { type: "header", text: "AI Spam Filter" };
	if (tier !== "pro") {
		return [
			header,
			{
				type: "banner",
				title: "Pro feature",
				description:
					"AI spam scoring requires a Pro license. Activate Pro in Settings to enable it.",
				variant: "default",
			},
		];
	}

	const globalDefaults = await getSpamSettings(ctx);
	const effective = effectiveSpamSettings(form, globalDefaults);
	const hasOverride = !!form.spam;
	const inheritedNote = hasOverride
		? `Form override active. Global default is ${globalDefaults.enabled ? `on @ ${globalDefaults.threshold}/10` : "off"}.`
		: `Inheriting global default: ${globalDefaults.enabled ? `on @ ${globalDefaults.threshold}/10` : "off"}. Toggle "Use custom settings" to override.`;

	return [
		header,
		{ type: "context", text: inheritedNote },
		{
			type: "stats",
			items: [
				{ label: "Effective state", value: effective.enabled ? "On" : "Off" },
				{ label: "Effective threshold", value: `${effective.threshold} / 10` },
				{ label: "Source", value: hasOverride ? "Per-form" : "Global default" },
			],
		},
		{
			type: "form",
			block_id: "form_spam",
			fields: [
				{
					type: "toggle",
					action_id: "use_custom",
					label: "Use custom settings for this form",
					initial_value: hasOverride,
				},
				{
					type: "toggle",
					action_id: "enabled",
					label: "Enable AI spam scoring",
					initial_value: hasOverride ? !!form.spam?.enabled : effective.enabled,
				},
				{
					type: "text_input",
					action_id: "threshold",
					label: "Flag threshold (0-10)",
					initial_value: String(
						hasOverride ? form.spam!.threshold : effective.threshold,
					),
					placeholder: "7",
				},
			],
			submit: {
				label: "Save Spam Settings",
				action_id: `save_form_spam:${formId}`,
			},
		},
	];
}

async function notificationsForFormBlocks(
	formId: string,
	ctx: PluginContext,
): Promise<object[]> {
	const form = (await ctx.storage.forms.get(formId)) as StoredForm | null;
	if (!form) return [];

	const { items: assignmentItems } =
		await ctx.storage.notificationAssignments.query({
			where: { formId },
			limit: 100,
		});
	const assignments = assignmentItems as Array<{
		id: string;
		data: StoredAssignment;
	}>;

	const { items: templateItems } = await ctx.storage.templates.query({});
	const templates = templateItems as Array<{
		id: string;
		data: StoredTemplate;
	}>;
	const templateById = new Map(templates.map((t) => [t.id, t.data] as const));

	const emailFields = form.rows
		.flatMap((r) => r.fields)
		.filter((f) => f.type === "email")
		.map((f) => ({ value: f.handle, label: `Submitter (${f.label})` }));

	const header = { type: "header", text: "Notifications" };

	if (templates.length === 0) {
		return [
			header,
			{
				type: "empty",
				title: "No templates available",
				description:
					"Create a template in the Templates page first, then come back here to attach it.",
				size: "base",
			},
		];
	}

	const list =
		assignments.length === 0
			? [
					{
						type: "empty",
						title: "No notifications on this form",
						description:
							"Attach a template below to send email when this form is submitted.",
						size: "base",
					},
				]
			: assignments.flatMap(({ id, data: a }) => {
					const template = templateById.get(a.templateId);
					const templateLabel = template
						? template.name
						: `(deleted template ${a.templateId})`;
					const recipientLabel =
						a.recipientType === "submitter"
							? `Submitter via "${a.recipientField ?? "?"}"`
							: (a.customRecipient ?? "(no recipient)");
					return [
						{
							type: "columns",
							columns: [
								[
									{ type: "section", text: templateLabel },
									{
										type: "fields",
										fields: [
											{ label: "Recipient", value: recipientLabel },
											{
												label: "Status",
												value: a.enabled ? "Enabled" : "Disabled",
											},
										],
									},
								],
								[
									{
										type: "actions",
										elements: [
											{
												type: "button",
												label: a.enabled ? "Disable" : "Enable",
												action_id: `toggle_notif:${id}`,
											},
											{
												type: "button",
												label: "Detach",
												action_id: `detach_notif:${id}`,
												style: "danger",
											},
										],
									},
								],
							],
						},
						{ type: "divider" },
					];
				});

	const recipientOptions = [
		...emailFields,
		{ value: "__custom__", label: "Custom email address" },
	];

	const attachForm = {
		type: "form",
		block_id: "attach_notif",
		fields: [
			{
				type: "select",
				action_id: "template_id",
				label: "Template",
				options: templates.map((t) => ({ label: t.data.name, value: t.id })),
				initial_value: templates[0]?.id,
			},
			{
				type: "select",
				action_id: "recipient",
				label: "Recipient",
				options: recipientOptions,
				initial_value: recipientOptions[0]?.value,
			},
			{
				type: "text_input",
				action_id: "custom_email",
				label: "Custom recipient email (if Custom selected above)",
				placeholder: "you@example.com",
			},
		],
		submit: {
			label: "Attach Notification",
			action_id: `attach_notif:${formId}`,
		},
	};

	return [
		header,
		...list,
		{ type: "header", text: "Attach a notification" },
		attachForm,
	];
}
