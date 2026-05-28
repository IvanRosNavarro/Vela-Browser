import {
  z,
  type CommandCategory,
  type CommandContext,
  type CommandDefinition,
} from '@vela/shared';

export interface RegisteredCommand<Args = unknown> extends CommandDefinition<Args> {
  run: (ctx: CommandContext, args?: Args) => Promise<void> | void;
}

/**
 * Builder tipado para registrar comandos. Si `argsSchema` se define, el
 * tipo de `args` en `run` se infiere automáticamente con `z.infer<S>`;
 * si no, `run` no recibe argumentos. Lo escribimos como helper porque
 * la inferencia genérica al pasar un objeto a `register<Args>` no
 * propaga `Args` desde `argsSchema` de forma fiable en zod 4.
 */
type ArgsOf<S> = S extends z.ZodType<infer T> ? T : never;

interface DefinitionWithSchema<S extends z.ZodTypeAny> {
  id: string;
  title: string;
  category: CommandCategory;
  defaultShortcut?: string;
  argsSchema: S;
  isVisible?: (ctx: CommandContext) => boolean;
  run: (ctx: CommandContext, args: ArgsOf<S>) => Promise<void> | void;
}

interface DefinitionWithoutSchema {
  id: string;
  title: string;
  category: CommandCategory;
  defaultShortcut?: string;
  isVisible?: (ctx: CommandContext) => boolean;
  run: (ctx: CommandContext) => Promise<void> | void;
}

export function defineCommand<S extends z.ZodTypeAny>(
  cmd: DefinitionWithSchema<S>,
): RegisteredCommand<ArgsOf<S>>;
export function defineCommand(
  cmd: DefinitionWithoutSchema,
): RegisteredCommand<void>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineCommand(cmd: any): RegisteredCommand<any> {
  return cmd as RegisteredCommand<unknown>;
}

export class CommandRegistry {
  private readonly commands = new Map<string, RegisteredCommand<unknown>>();

  register<Args>(cmd: RegisteredCommand<Args>): void {
    if (this.commands.has(cmd.id)) {
      throw new Error(`Command already registered: ${cmd.id}`);
    }
    this.commands.set(cmd.id, cmd as RegisteredCommand<unknown>);
  }

  unregister(id: string): void {
    this.commands.delete(id);
  }

  get(id: string): RegisteredCommand<unknown> | undefined {
    return this.commands.get(id);
  }

  list(): readonly RegisteredCommand<unknown>[] {
    return [...this.commands.values()];
  }

  async execute(
    id: string,
    ctx: CommandContext,
    args?: unknown,
  ): Promise<void> {
    const cmd = this.commands.get(id);
    if (!cmd) {
      throw new Error(`Unknown command: ${id}`);
    }
    let resolvedArgs: unknown = args;
    if (cmd.argsSchema) {
      // undefined args → try empty object so commands with all-optional schemas
      // work when invoked from keyboard shortcuts without explicit arguments.
      const parsed = cmd.argsSchema.safeParse(args ?? {});
      if (!parsed.success) {
        throw new Error(
          `Invalid args for ${id}: ${parsed.error.message}`,
        );
      }
      resolvedArgs = parsed.data;
    }
    await cmd.run(ctx, resolvedArgs);
  }
}
