import React, { useEffect, useState } from 'react';
import { 
  ActivityIndicator, 
  Alert, 
  Image, 
  Modal, 
  ScrollView, 
  StyleSheet, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  View 
} from 'react-native';
import { db } from '../firebase';
import { doc, updateDoc, deleteDoc } from "@react-native-firebase/firestore";
import { Chore, Profile } from '../types';
import { namesMatch } from '../utils/nameMatch';

interface ChoreDetailModalProps {
  visible: boolean;
  chore: Chore | null;
  profile: Profile;
  onClose: () => void;
  onUploadProof: (chore: Chore) => Promise<void>;
  onApprove: (chore: Chore) => Promise<void>;
  onRedo: (chore: Chore, feedback: string) => Promise<void>;
  uploading: boolean;
  deciding?: boolean;
}

const formatDate = (date: Date) => {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const y = String(date.getFullYear()).slice(-2);
  return `${m}-${d}-${y}`;
};

export const ChoreDetailModal: React.FC<ChoreDetailModalProps> = ({
  visible,
  chore,
  profile,
  onClose,
  onUploadProof,
  onApprove,
  onRedo,
  uploading,
  deciding = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editPoints, setEditPoints] = useState("0");
  const [showRedoForm, setShowRedoForm] = useState(false);
  const [redoFeedback, setRedoFeedback] = useState('');
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    setShowRedoForm(false);
    setRedoFeedback('');
    setIsEditing(false);
    setPreviewPhotoUrl(null);
  }, [chore?.id, visible]);

  if (!chore) return null;
  const isAssignee = Boolean(
    (chore.assignedToUid && chore.assignedToUid === profile.uid) ||
    namesMatch(chore.assignedTo, profile.displayName)
  );
  const isBountyAvailable =
    Boolean(chore.isBounty) &&
    !chore.assignedToUid &&
    chore.status !== 'submitted' &&
    chore.status !== 'approved';
  const canActOnChore = isAssignee || isBountyAvailable;

  const handleUpdate = async () => {
    try {
      await updateDoc(doc(db, "chores", chore.id), {
        title: editTitle.trim(),
        points: parseInt(editPoints) || 0,
      });
      setIsEditing(false);
    } catch {
      Alert.alert("Error", "Update failed.");
    }
  };

  const handleDelete = async () => {
    Alert.alert("Delete", "Are you sure?", [
      { text: "Cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await deleteDoc(doc(db, "chores", chore.id));
          onClose();
        } catch {
          Alert.alert("Error", "Delete failed.");
        }
      }}
    ]);
  };

  const toggleStep = async (idx: number) => {
    const updated = [...(chore.steps || [])];
    updated[idx] = updated[idx].startsWith("✓ ") ? updated[idx].substring(2) : "✓ " + updated[idx];
    try {
      await updateDoc(doc(db, "chores", chore.id), { 
        steps: updated, 
        status: "in_progress" 
      });
    } catch (e) {
      console.error("Error toggling step:", e);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      statusBarTranslucent={previewPhotoUrl !== null}
      onRequestClose={() => {
        if (previewPhotoUrl) {
          setPreviewPhotoUrl(null);
        } else if (!uploading) {
          onClose();
        }
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{isEditing ? "Edit Chore" : "Details"}</Text>
            <TouchableOpacity onPress={() => { if (!uploading) { onClose(); setIsEditing(false); } }}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView>
            {!isEditing ? (
              <>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Chore</Text>
                  <Text style={styles.detailValue}>{chore.title}</Text>
                </View>
                {chore.description ? (
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Description</Text>
                    <Text style={styles.detailValue}>{chore.description}</Text>
                  </View>
                ) : null}
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Value</Text>
                  <Text style={[styles.detailValue, { color: '#F59E0B', fontWeight: '800' }]}>{chore.points} Points</Text>
                </View>
                
                {chore.steps && chore.steps.length > 0 && (
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Checklist</Text>
                    {chore.steps.map((s, i) => (
                      <TouchableOpacity 
                        key={i} 
                        style={styles.stepRow} 
                        disabled={!canActOnChore || chore.status === 'approved'} 
                        onPress={() => toggleStep(i)}
                      >
                        <View style={[styles.checkbox, s.startsWith("✓ ") && styles.checkboxActive]} />
                        <Text style={[styles.stepText, s.startsWith("✓ ") && styles.stepTextDone]}>
                          {s.startsWith("✓ ") ? s.substring(2) : s}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Deadline</Text>
                  <Text style={styles.detailValue}>{chore.dueAt ? formatDate(chore.dueAt.toDate()) : 'None'}</Text>
                </View>

                {chore.status === 'redo' && chore.feedback ? (
                  <View style={styles.feedbackCard}>
                    <Text style={styles.feedbackLabel}>What needs another try</Text>
                    <Text style={styles.feedbackText}>{chore.feedback}</Text>
                  </View>
                ) : null}
                
                {chore.photoUrls && chore.photoUrls.length > 0 && (
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Proof</Text>
                    <ScrollView horizontal>
                      {chore.photoUrls.map((url, index) => (
                        <TouchableOpacity
                          key={url}
                          accessibilityRole="button"
                          accessibilityLabel={`View proof photo ${index + 1} full screen`}
                          style={styles.galleryButton}
                          onPress={() => setPreviewPhotoUrl(url)}
                        >
                          <Image source={{ uri: url }} style={styles.galleryImage} />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    <Text style={styles.galleryHint}>Tap a photo to view it full screen.</Text>
                  </View>
                )}

                <View style={styles.modalActions}>
                  {chore.status !== 'approved' && chore.status !== 'submitted' && canActOnChore && (
                    <TouchableOpacity 
                      style={[styles.primaryBtn, uploading && { opacity: 0.7 }]} 
                      disabled={uploading} 
                      onPress={() => onUploadProof(chore)}
                    >
                      {uploading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>Complete & Submit</Text>}
                    </TouchableOpacity>
                  )}
                  
                  {profile.role === 'parent' && chore.status === 'submitted' && (
                    <View>
                      {showRedoForm ? (
                        <View style={styles.redoCard}>
                          <Text style={styles.inputLabel}>What specifically needs another try?</Text>
                          <TextInput
                            style={[styles.input, styles.redoInput]}
                            value={redoFeedback}
                            onChangeText={setRedoFeedback}
                            multiline
                            placeholder="Example: Please wipe the counter behind the toaster too."
                            placeholderTextColor="#94A3B8"
                          />
                          <View style={styles.row}>
                            <TouchableOpacity
                              accessibilityRole="button"
                              style={[styles.secondaryBtn, styles.flexButton, styles.buttonSpacer]}
                              disabled={deciding}
                              onPress={() => setShowRedoForm(false)}
                            >
                              <Text style={styles.secondaryBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              accessibilityRole="button"
                              style={[styles.redoBtn, styles.flexButton, deciding && styles.disabledBtn]}
                              disabled={deciding}
                              onPress={async () => {
                                await onRedo(chore, redoFeedback);
                              }}
                            >
                              <Text style={styles.primaryBtnText}>Send Back</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <View style={styles.row}>
                          <TouchableOpacity
                            accessibilityRole="button"
                            style={[styles.secondaryBtn, styles.flexButton, styles.buttonSpacer]}
                            disabled={deciding}
                            onPress={() => setShowRedoForm(true)}
                          >
                            <Text style={styles.secondaryBtnText}>Needs Redo</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            accessibilityRole="button"
                            style={[styles.approveBtn, styles.flexButton, deciding && styles.disabledBtn]}
                            disabled={deciding}
                            onPress={() => onApprove(chore)}
                          >
                            <Text style={styles.primaryBtnText}>Approve & Pay</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}

                  {profile.role === 'parent' && (
                    <>
                      <TouchableOpacity 
                        style={[styles.secondaryBtn, { marginTop: 12 }]} 
                        onPress={() => {
                          setEditTitle(chore.title);
                          setEditPoints(String(chore.points || 0));
                          setIsEditing(true);
                        }}
                      >
                        <Text style={styles.secondaryBtnText}>Edit Details</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity 
                        style={[styles.secondaryBtn, { backgroundColor: '#FEE2E2', borderColor: '#FECACA', borderWidth: 1, marginTop: 12 }]} 
                        onPress={handleDelete}
                      >
                        <Text style={[styles.secondaryBtnText, { color: '#EF4444' }]}>Delete Chore</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </>
            ) : (
              <View style={styles.formCard}>
                <Text style={styles.inputLabel}>Title</Text>
                <TextInput style={styles.input} value={editTitle} onChangeText={setEditTitle} />
                <Text style={styles.inputLabel}>Points</Text>
                <TextInput style={styles.input} value={editPoints} onChangeText={setEditPoints} keyboardType="numeric" />
                <TouchableOpacity style={styles.primaryBtn} onPress={handleUpdate}>
                  <Text style={styles.primaryBtnText}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
        {previewPhotoUrl ? (
          <View style={styles.proofViewer}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close full-screen proof photo"
              style={styles.proofCloseButton}
              onPress={() => setPreviewPhotoUrl(null)}
            >
              <Text style={styles.proofCloseText}>Close</Text>
            </TouchableOpacity>
            <Image
              accessibilityLabel="Full-screen chore proof"
              source={{ uri: previewPhotoUrl }}
              style={styles.proofFullImage}
              resizeMode="contain"
            />
          </View>
        ) : null}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  closeText: { color: '#2563EB', fontWeight: '600' },
  detailItem: { marginBottom: 16 },
  detailLabel: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  detailValue: { fontSize: 16, color: '#0F172A' },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#CBD5E1', marginRight: 10 },
  checkboxActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  stepText: { fontSize: 16 },
  stepTextDone: { textDecorationLine: 'line-through', color: '#94A3B8' },
  galleryButton: { marginRight: 10, borderRadius: 12, overflow: 'hidden' },
  galleryImage: { width: 100, height: 100 },
  galleryHint: { color: '#64748B', fontSize: 12, marginTop: 8 },
  proofViewer: { ...StyleSheet.absoluteFill, zIndex: 10, elevation: 10, backgroundColor: 'rgba(0, 0, 0, 0.97)', alignItems: 'center', justifyContent: 'center' },
  proofCloseButton: { position: 'absolute', top: 48, right: 20, zIndex: 1, borderRadius: 999, backgroundColor: 'rgba(15, 23, 42, 0.8)', paddingHorizontal: 18, paddingVertical: 10 },
  proofCloseText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  proofFullImage: { width: '100%', height: '100%' },
  modalActions: { marginTop: 20 },
  primaryBtn: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center', width: '100%' },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  secondaryBtn: { backgroundColor: '#F1F5F9', borderRadius: 12, paddingVertical: 14, alignItems: 'center', width: '100%' },
  secondaryBtnText: { color: '#0F172A', fontWeight: '600' },
  approveBtn: { backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  redoBtn: { backgroundColor: '#EF4444', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  flexButton: { flex: 1, width: undefined },
  buttonSpacer: { marginRight: 8 },
  disabledBtn: { opacity: 0.6 },
  redoCard: { backgroundColor: '#FFF7ED', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#FED7AA' },
  redoInput: { minHeight: 90, textAlignVertical: 'top' },
  feedbackCard: { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' },
  feedbackLabel: { color: '#B91C1C', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  feedbackText: { color: '#7F1D1D', fontSize: 15, lineHeight: 21, marginTop: 5 },
  formCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#E2E8F0', width: '100%' },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', color: '#0F172A' },
});
