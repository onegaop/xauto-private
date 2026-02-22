import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BookmarkItemDocument = HydratedDocument<BookmarkItem>;

@Schema({ collection: 'bookmark_items', timestamps: true })
export class BookmarkItem {
  @Prop({ required: true, unique: true, index: true })
  tweetId!: string;

  @Prop({ required: true })
  createdAtX!: Date;

  @Prop({ required: true })
  authorName!: string;

  @Prop({ required: true })
  text!: string;

  @Prop({ required: true })
  url!: string;

  @Prop({ type: Object, required: true })
  rawJson!: Record<string, unknown>;

  @Prop({ required: true, index: true })
  syncedAt!: Date;
}

export const BookmarkItemSchema = SchemaFactory.createForClass(BookmarkItem);
