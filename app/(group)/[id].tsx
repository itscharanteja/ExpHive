import React from "react";
import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  SafeAreaView,
  SectionList,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  onSnapshot,
  addDoc,
  Timestamp,
  updateDoc,
  getDocs,
  arrayUnion,
  arrayRemove,
  deleteDoc,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../context/auth";
import DateTimePickerModal from "react-native-modal-datetime-picker";

type GroupExpense = {
  id: string;
  amount: number;
  description: string;
  paidBy: string;
  splitBetween: string[];
  date: Date;
  settled: boolean;
  receiptId?: string;
};

type GroupTask = {
  id: string;
  title: string;
  assignedTo: string;
  completed: boolean;
  dueDate: Date;
};

type GroupDetails = {
  id: string;
  name: string;
  createdBy: string;
  members: string[];
};

type GroupReminder = {
  id: string;
  title: string;
  dueDate: Date;
  createdBy: string;
  createdAt: Date;
  completed: boolean;
};

type Section = {
  title: string;
  data: any[];
  renderItem: ({ item }: { item: any }) => JSX.Element;
};

const getDueColor = (dueDate: Date) => {
  const now = new Date();
  const diffHours = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffHours < 0) {
    return "#FF3B30"; // Red for overdue
  } else if (diffHours <= 6) {
    return "#FF9500"; // Orange for due within 6 hours
  } else {
    return "#34C759"; // Green for due later
  }
};

export default function GroupDetails() {
  const { user, userData } = useAuth();
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [expenses, setExpenses] = useState<GroupExpense[]>([]);
  const [tasks, setTasks] = useState<GroupTask[]>([]);
  const [totalGroupExpense, setTotalGroupExpense] = useState(0);
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [reminders, setReminders] = useState<GroupReminder[]>([]);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [newReminder, setNewReminder] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);

  useEffect(() => {
    if (!user || !id) return;

    // Fetch group details
    const fetchGroup = async () => {
      try {
        const groupDoc = await getDoc(doc(db, "groups", id as string));
        if (groupDoc.exists()) {
          setGroup({ id: groupDoc.id, ...groupDoc.data() } as GroupDetails);
        } else {
          Alert.alert("Error", "Group not found");
          router.back();
        }
      } catch (error) {
        console.error("Error fetching group:", error);
        Alert.alert("Error", "Failed to load group details");
      }
    };

    // Listen to group expenses
    const expensesQuery = query(
      collection(db, "groupExpenses"),
      where("groupId", "==", id)
    );

    const unsubscribeExpenses = onSnapshot(expensesQuery, (snapshot) => {
      const expensesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate(),
      })) as GroupExpense[];

      // Calculate total group expense
      const total = expensesData.reduce(
        (sum, expense) => sum + expense.amount,
        0
      );
      setTotalGroupExpense(total);

      setExpenses(expensesData);
    });

    // Listen to group tasks
    const tasksQuery = query(
      collection(db, "groupTasks"),
      where("groupId", "==", id)
    );

    const unsubscribeTasks = onSnapshot(tasksQuery, (snapshot) => {
      const tasksData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        dueDate: doc.data().dueDate.toDate(),
      })) as GroupTask[];
      setTasks(tasksData);
    });

    // Listen to group reminders
    const remindersQuery = query(
      collection(db, "groupReminders"),
      where("groupId", "==", id),
      orderBy("dueDate", "asc")
    );

    const unsubscribeReminders = onSnapshot(remindersQuery, (snapshot) => {
      const remindersData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        dueDate: doc.data().dueDate.toDate(),
        createdAt: doc.data().createdAt.toDate(),
      })) as GroupReminder[];
      setReminders(remindersData);
    });

    fetchGroup();
    setLoading(false);

    return () => {
      unsubscribeExpenses();
      unsubscribeTasks();
      unsubscribeReminders();
    };
  }, [id, user]);

  const toggleTaskStatus = async (taskId: string, completed: boolean) => {
    try {
      await updateDoc(doc(db, "groupTasks", taskId), { completed });
    } catch (error) {
      console.error("Error updating task:", error);
      Alert.alert("Error", "Failed to update task");
    }
  };

  const checkUserExists = async (email: string): Promise<boolean> => {
    try {
      const usersRef = collection(db, "users");
      const q = query(
        usersRef,
        where("email", "==", email.toLowerCase().trim())
      );
      const querySnapshot = await getDocs(q);
      return !querySnapshot.empty;
    } catch (error) {
      console.error("Error checking user existence:", error);
      return false;
    }
  };

  const handleAddMember = async () => {
    if (!group || !memberEmail || !user || !userData) return;

    try {
      setAddingMember(true);
      // First check if user exists
      const usersRef = collection(db, "users");
      const userQuery = query(
        usersRef,
        where("email", "==", memberEmail.toLowerCase())
      );
      const userSnapshot = await getDocs(userQuery);

      if (userSnapshot.empty) {
        Alert.alert("Error", "User not found");
        return;
      }

      // Update group members
      await updateDoc(doc(db, "groups", id as string), {
        members: arrayUnion(memberEmail.toLowerCase()),
      });

      // Create notification for the added user
      const notificationData = {
        type: "GROUP_ADDITION",
        groupId: id,
        groupName: group.name,
        addedBy: user.email,
        addedByUsername: userData.username,
        recipientEmail: memberEmail.toLowerCase(),
        createdAt: Timestamp.now(),
        read: false,
      };

      await addDoc(collection(db, "notifications"), notificationData);

      setMemberEmail(""); // Clear input
      setMemberModalVisible(false);
      Alert.alert("Success", "Member added successfully");
    } catch (error) {
      console.error("Error adding member:", error);
      Alert.alert("Error", "Failed to add member");
    } finally {
      setAddingMember(false);
    }
  };

  const removeMember = async (memberEmail: string) => {
    Alert.alert(
      "Remove Member",
      `Are you sure you want to remove ${memberEmail} from the group?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              if (!group) return;

              const updatedMembers = group.members.filter(
                (email) => email !== memberEmail
              );

              await updateDoc(doc(db, "groups", id as string), {
                members: updatedMembers,
              });

              Alert.alert("Success", "Member removed successfully");
            } catch (error) {
              console.error("Error removing member:", error);
              Alert.alert("Error", "Failed to remove member");
            }
          },
        },
      ]
    );
  };

  const handleLongPressExpense = (expense: GroupExpense) => {
    Alert.alert(
      "Delete Expense",
      "Are you sure you want to delete this expense?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              // First delete the receipt if it exists
              if (expense.receiptId) {
                try {
                  // Get receipt document to ensure it exists
                  const receiptRef = doc(db, "receipts", expense.receiptId);
                  const receiptDoc = await getDoc(receiptRef);

                  if (receiptDoc.exists()) {
                    await deleteDoc(receiptRef);
                  }
                } catch (error) {
                  console.error("Error deleting receipt:", error);
                  // Continue with expense deletion even if receipt deletion fails
                }
              }

              // Then delete the expense
              await deleteDoc(doc(db, "groupExpenses", expense.id));
              Alert.alert("Success", "Expense deleted successfully");
            } catch (error) {
              console.error("Error deleting expense:", error);
              Alert.alert("Error", "Failed to delete expense");
            }
          },
        },
      ]
    );
  };

  const handleLongPressTask = (task: GroupTask) => {
    Alert.alert("Delete Task", "Are you sure you want to delete this task?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "groupTasks", task.id));
            Alert.alert("Success", "Task deleted successfully");
          } catch (error) {
            console.error("Error deleting task:", error);
            Alert.alert("Error", "Failed to delete task");
          }
        },
      },
    ]);
  };

  const addReminder = async () => {
    if (!user || !id || !newReminder.trim()) {
      Alert.alert("Error", "Please enter a reminder");
      return;
    }

    try {
      const reminderData = {
        title: newReminder.trim(),
        dueDate: Timestamp.fromDate(selectedDate),
        createdBy: user.email,
        createdAt: Timestamp.now(),
        groupId: id,
        completed: false,
      };

      await addDoc(collection(db, "groupReminders"), reminderData);
      setReminderModalVisible(false);
      setNewReminder("");
      setSelectedDate(new Date());
      Alert.alert("Success", "Reminder added successfully");
    } catch (error) {
      console.error("Error adding reminder:", error);
      Alert.alert("Error", "Failed to add reminder");
    }
  };

  const toggleReminderStatus = async (
    reminderId: string,
    completed: boolean
  ) => {
    try {
      await updateDoc(doc(db, "groupReminders", reminderId), { completed });
    } catch (error) {
      console.error("Error updating reminder:", error);
      Alert.alert("Error", "Failed to update reminder");
    }
  };

  const showDatePicker = () => {
    setDatePickerVisible(true);
  };

  const hideDatePicker = () => {
    setDatePickerVisible(false);
  };

  const handleConfirm = (date: Date) => {
    setSelectedDate(date);
    hideDatePicker();
  };

  const handleDeleteGroup = async () => {
    if (!group || !user) return;

    // Only group creator can delete the group
    if (group.createdBy !== user.email) {
      Alert.alert("Error", "Only group creator can delete the group");
      return;
    }

    Alert.alert(
      "Delete Group",
      "Are you sure you want to delete this group? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const batch = writeBatch(db);

              // Delete all group expenses
              const expensesQuery = query(
                collection(db, "groupExpenses"),
                where("groupId", "==", id)
              );
              const expensesDocs = await getDocs(expensesQuery);
              expensesDocs.forEach((doc) => {
                batch.delete(doc.ref);
              });

              // Delete all group tasks
              const tasksQuery = query(
                collection(db, "groupTasks"),
                where("groupId", "==", id)
              );
              const tasksDocs = await getDocs(tasksQuery);
              tasksDocs.forEach((doc) => {
                batch.delete(doc.ref);
              });

              // Create removal notifications for all members except creator
              const removedMembers = group.members.filter(
                (member) => member !== user.email
              );

              removedMembers.forEach((memberEmail) => {
                const notificationRef = doc(collection(db, "notifications"));
                batch.set(notificationRef, {
                  type: "GROUP_DELETION",
                  groupName: group.name,
                  deletedBy: user.email,
                  deletedByUsername: userData?.username,
                  recipientEmail: memberEmail,
                  createdAt: Timestamp.now(),
                  read: false,
                });
              });

              // Delete the group document
              batch.delete(doc(db, "groups", id as string));

              // Commit all the batch operations
              await batch.commit();

              Alert.alert("Success", "Group deleted successfully", [
                {
                  text: "OK",
                  onPress: () => router.back(),
                },
              ]);
            } catch (error) {
              console.error("Error deleting group:", error);
              Alert.alert("Error", "Failed to delete group");
            }
          },
        },
      ]
    );
  };

  const sections: Section[] = [
    {
      title: "Expenses",
      data: expenses,
      renderItem: ({ item }: { item: GroupExpense }) => (
        <TouchableOpacity
          style={styles.expenseItem}
          onPress={() =>
            router.push({
              pathname: "/(group)/[id]/expense/[expenseId]",
              params: { id: id as string, expenseId: item.id },
            })
          }
          onLongPress={() => handleLongPressExpense(item)}
          delayLongPress={500}
        >
          <View>
            <Text style={styles.expenseDescription}>{item.description}</Text>
            <Text style={styles.expenseDate}>
              {item.date.toLocaleDateString()}
            </Text>
            <Text style={styles.paidByText}>Paid by {item.paidBy}</Text>
          </View>
          <Text style={styles.expenseAmount}>{item.amount.toFixed(2)} kr</Text>
        </TouchableOpacity>
      ),
    },
    {
      title: "Tasks",
      data: tasks,
      renderItem: ({ item }: { item: GroupTask }) => (
        <TouchableOpacity
          style={styles.taskItem}
          onPress={() => toggleTaskStatus(item.id, !item.completed)}
          onLongPress={() => handleLongPressTask(item)}
          delayLongPress={500}
        >
          <Ionicons
            name={item.completed ? "checkbox" : "square-outline"}
            size={24}
            color="#007AFF"
          />
          <View style={styles.taskContent}>
            <Text
              style={[styles.taskTitle, item.completed && styles.taskCompleted]}
            >
              {item.title}
            </Text>
            <Text style={styles.taskDetails}>
              Assigned to {item.assignedTo} • Due{" "}
              {item.dueDate.toLocaleDateString()}
            </Text>
          </View>
        </TouchableOpacity>
      ),
    },
    {
      title: "Members",
      data: group?.members || [],
      renderItem: ({ item: memberEmail }: { item: string }) => (
        <View style={styles.memberItem}>
          <Text style={styles.memberEmail}>{memberEmail}</Text>
          {memberEmail !== group?.createdBy &&
            user?.email === group?.createdBy && (
              <TouchableOpacity
                onPress={() => removeMember(memberEmail)}
                style={styles.removeButton}
              >
                <Ionicons name="close-circle" size={24} color="#FF3B30" />
              </TouchableOpacity>
            )}
          {memberEmail === group?.createdBy && (
            <Text style={styles.adminBadge}>Admin</Text>
          )}
        </View>
      ),
    },
  ];

  // Function to create notifications
  const createNotification = async (
    type: "TASK_ASSIGNED" | "GROUP_EXPENSE" | "GROUP_REMINDER",
    data: {
      recipientEmail: string;
      title?: string;
      amount?: number;
      dueDate?: Date;
      description?: string;
    }
  ) => {
    try {
      const notificationData = {
        type,
        groupId: id,
        groupName: group?.name,
        createdBy: user?.email,
        createdByUsername: userData?.username,
        createdAt: Timestamp.now(),
        read: false,
        // Spread data at the beginning so we can override if needed
        ...data,
      };

      await addDoc(collection(db, "notifications"), notificationData);
    } catch (error) {
      console.error("Error creating notification:", error);
    }
  };

  // Update task creation to include notification
  const handleAddTask = async (taskData: any) => {
    try {
      const newTask = await addDoc(collection(db, "groupTasks"), {
        ...taskData,
        groupId: id,
      });

      // Create notification for assigned user
      await createNotification("TASK_ASSIGNED", {
        recipientEmail: taskData.assignedTo,
        title: taskData.title,
        dueDate: taskData.dueDate,
      });
    } catch (error) {
      console.error("Error adding task:", error);
    }
  };

  // Update expense creation to include notifications
  const handleAddExpense = async (expenseData: any) => {
    try {
      const newExpense = await addDoc(collection(db, "groupExpenses"), {
        ...expenseData,
        groupId: id,
      });

      // Create notifications for all split members
      for (const memberEmail of expenseData.splitBetween) {
        if (memberEmail !== user?.email) {
          await createNotification("GROUP_EXPENSE", {
            recipientEmail: memberEmail,
            amount: expenseData.amount,
            description: expenseData.description,
          });
        }
      }
    } catch (error) {
      console.error("Error adding expense:", error);
    }
  };

  // Update reminder creation to include notifications
  const handleAddReminder = async (reminderData: any) => {
    try {
      // Create notifications for all group members
      for (const memberEmail of group?.members || []) {
        if (memberEmail !== user?.email) {
          await createNotification("GROUP_REMINDER", {
            recipientEmail: memberEmail,
            title: reminderData.title,
            dueDate: reminderData.dueDate,
          });
        }
      }
    } catch (error) {
      console.error("Error adding reminder:", error);
    }
  };

  if (loading || !group) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.title}>{group?.name}</Text>
        {group?.createdBy === user?.email && (
          <TouchableOpacity
            onPress={handleDeleteGroup}
            style={styles.deleteButton}
          >
            <Ionicons name="trash-outline" size={24} color="#FF3B30" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.totalExpenseContainer}>
        <Text style={styles.totalExpenseLabel}>Total Group Expense</Text>
        <Text style={styles.totalExpenseAmount}>
          {totalGroupExpense.toFixed(2)} kr
        </Text>
      </View>

      <SectionList
        sections={sections}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {title === "Expenses" && (
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/(group)/[id]/add-expense",
                    params: { id: id as string },
                  })
                }
                style={styles.addButton}
              >
                <Ionicons name="add" size={24} color="white" />
              </TouchableOpacity>
            )}
            {title === "Tasks" && (
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/(group)/[id]/add-task",
                    params: { id: id as string },
                  })
                }
                style={styles.addButton}
              >
                <Ionicons name="add" size={24} color="white" />
              </TouchableOpacity>
            )}
            {title === "Members" && (
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setMemberModalVisible(true)}
              >
                <Ionicons name="person-add" size={20} color="white" />
              </TouchableOpacity>
            )}
          </View>
        )}
        keyExtractor={(item, index) => {
          if (typeof item === "string") return item;
          return item.id || index.toString();
        }}
      />

      <Modal
        visible={memberModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setMemberModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Member</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter member's email"
              value={memberEmail}
              onChangeText={setMemberEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => {
                  setMemberEmail("");
                  setMemberModalVisible(false);
                }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.addButton,
                  addingMember && styles.buttonDisabled,
                ]}
                onPress={handleAddMember}
                disabled={addingMember}
              >
                <Text style={styles.buttonText}>
                  {addingMember ? "Adding..." : "Add Member"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={reminderModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setReminderModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Reminder</Text>

            <TextInput
              style={styles.input}
              placeholder="Enter reminder"
              value={newReminder}
              onChangeText={setNewReminder}
              multiline
            />

            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={showDatePicker}
            >
              <Text style={styles.datePickerButtonText}>
                Due: {selectedDate.toLocaleString()}
              </Text>
            </TouchableOpacity>

            <DateTimePickerModal
              isVisible={isDatePickerVisible}
              mode="datetime"
              onConfirm={handleConfirm}
              onCancel={hideDatePicker}
              date={selectedDate}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => {
                  setReminderModalVisible(false);
                  setNewReminder("");
                  setSelectedDate(new Date());
                }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.addButton]}
                onPress={addReminder}
              >
                <Text style={styles.buttonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  scrollContainer: {
    flex: 1,
    padding: 20,
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  addButton: {
    backgroundColor: "#007AFF",
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  expenseItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "white",
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  expenseDescription: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
  },
  expenseDate: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  paidByText: {
    fontSize: 14,
    color: "#007AFF",
    fontStyle: "italic",
  },
  expenseAmount: {
    fontSize: 18,
    fontWeight: "bold",
  },
  taskItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    backgroundColor: "white",
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  taskContent: {
    marginLeft: 10,
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: "500",
  },
  taskCompleted: {
    textDecorationLine: "line-through",
    color: "#666",
  },
  taskDetails: {
    fontSize: 14,
    color: "#666",
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  memberEmail: {
    flex: 1,
    fontSize: 16,
  },
  removeButton: {
    padding: 4,
  },
  adminBadge: {
    fontSize: 12,
    color: "#007AFF",
    fontWeight: "bold",
    marginLeft: 8,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  memberInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 10,
    borderRadius: 5,
  },
  addMemberButton: {
    backgroundColor: "#007AFF",
    padding: 10,
    borderRadius: 5,
    minWidth: 60,
    alignItems: "center",
  },
  addMemberButtonText: {
    color: "white",
    fontWeight: "bold",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  button: {
    padding: 15,
    borderRadius: 5,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#FF3B30",
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
  },
  totalExpenseContainer: {
    backgroundColor: "#f8f8f8",
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  totalExpenseLabel: {
    fontSize: 16,
    color: "#666",
    marginBottom: 8,
  },
  totalExpenseAmount: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#007AFF",
  },
  reminderItem: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  completedReminder: {
    opacity: 0.7,
  },
  reminderContent: {
    flex: 1,
  },
  reminderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  reminderTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  reminderDetails: {
    gap: 4,
  },
  reminderDueDate: {
    fontSize: 14,
    fontWeight: "500",
  },
  reminderCreatedBy: {
    fontSize: 12,
    color: "#666",
  },
  noRemindersText: {
    textAlign: "center",
    color: "#666",
    padding: 20,
  },
  datePickerButton: {
    backgroundColor: "#f0f0f0",
    padding: 15,
    borderRadius: 5,
    marginBottom: 15,
  },
  datePickerButtonText: {
    color: "#007AFF",
    textAlign: "center",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 20,
  },
  deleteButton: {
    padding: 8,
  },
});
