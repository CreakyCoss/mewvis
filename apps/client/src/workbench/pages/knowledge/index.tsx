import { useParams } from "react-router";
import { DetailPage } from "./components/detail";
import { LibraryPage } from "./components/library";

export { EmbeddingManagementPage } from "./embedding";

export const KnowledgePage = () => {
  const { collectionId } = useParams<{ collectionId?: string }>();
  return collectionId ? <DetailPage collectionId={collectionId} /> : <LibraryPage />;
};
