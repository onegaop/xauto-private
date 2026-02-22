import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SyncStateDocument = HydratedDocument<SyncState>;

@Schema({ collection: 'sync_state', timestamps: true })
export class SyncState {
  @Prop({ required: true, unique: true, index: true })
  key!: string;

  @Prop({ type: Object, required: true })
  value!: Record<string, unknown>;
}

export const SyncStateSchema = SchemaFactory.createForClass(SyncState);
