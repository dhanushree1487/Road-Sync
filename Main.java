import java.util.*;

/*
 * SMART MUNICIPAL ROAD MAINTENANCE SYSTEM
 * Simple single-file Java program.
 *
 * Concepts included:
 * - Classes and objects
 * - Encapsulation
 * - Inheritance
 * - Abstract classes
 * - Polymorphism
 * - Method overriding
 * - Method overloading
 * - Exception handling
 * - Composition
 * - HashMap
 * - HashSet
 * - PriorityQueue
 * - Graph
 * - Dijkstra's algorithm
 * - Three roles: Public, Municipal Operator, Maintenance Team
 */

enum Equipment {
    JACKHAMMER,
    ASPHALT_MIXER,
    ROAD_ROLLER,
    PAVER
}

enum RepairStatus {
    PENDING,
    ASSIGNED,
    IN_PROGRESS,
    COMPLETED
}

/* ---------------- EXCEPTIONS ---------------- */

class TeamUnavailableException extends Exception {
    public TeamUnavailableException(String message) {
        super(message);
    }
}

class InvalidRepairStateException extends Exception {
    public InvalidRepairStateException(String message) {
        super(message);
    }
}

/* ---------------- USER INHERITANCE ---------------- */

abstract class User {
    private String username;
    private String password;

    public User(String username, String password) {
        this.username = username;
        this.password = password;
    }

    public boolean login(String username, String password) {
        return this.username.equals(username) &&
               this.password.equals(password);
    }

    public String getUsername() {
        return username;
    }
}

class PublicUser extends User {
    public PublicUser(String username, String password) {
        super(username, password);
    }
}

class MunicipalOperator extends User {
    public MunicipalOperator(String username, String password) {
        super(username, password);
    }
}

/* ---------------- ROAD DAMAGE ---------------- */

class RoadDamage {
    private int damageId;
    private String location;
    private int severity;
    private int accidentRisk;
    private int trafficRank;
    private int importanceRank;
    private String type;
    private boolean isClosed;
    private int priority;

    public RoadDamage(int damageId, String location, int severity,
                      int accidentRisk, int trafficRank,
                      int importanceRank, String type) {

        this.damageId = damageId;
        this.location = location;
        this.severity = severity;
        this.accidentRisk = accidentRisk;
        this.trafficRank = trafficRank;
        this.importanceRank = importanceRank;
        this.type = type;
        this.isClosed = false;
        this.priority = 0;
    }

    public int getDamageId() {
        return damageId;
    }

    public String getLocation() {
        return location;
    }

    public int getSeverity() {
        return severity;
    }

    public int getAccidentRisk() {
        return accidentRisk;
    }

    public int getTrafficRank() {
        return trafficRank;
    }

    public int getImportanceRank() {
        return importanceRank;
    }

    public String getType() {
        return type;
    }

    public int getPriority() {
        return priority;
    }

    public boolean isClosed() {
        return isClosed;
    }

    // Encapsulation: controlled update of damage information
    public void updateDamage(int severity, int accidentRisk,
                             int trafficRank, int importanceRank) {
        this.severity = severity;
        this.accidentRisk = accidentRisk;
        this.trafficRank = trafficRank;
        this.importanceRank = importanceRank;
    }

    // Method overloading
    public void updateDamage(int severity, int accidentRisk,
                             int trafficRank, int importanceRank,
                             String type) {
        updateDamage(severity, accidentRisk, trafficRank, importanceRank);
        this.type = type;
    }

    public void markClosed() {
        isClosed = true;
    }

    public void reopen() {
        isClosed = false;
    }

    public void setPriority(int priority) {
        this.priority = priority;
    }

    public void display() {
        System.out.println(
            "Damage ID: " + damageId +
            " | Location: " + location +
            " | Type: " + type +
            " | Severity: " + severity +
            " | Risk: " + accidentRisk +
            " | Traffic: " + trafficRank +
            " | Importance: " + importanceRank +
            " | Priority: " + priority +
            " | Closed: " + isClosed
        );
    }
}

/* ---------------- PRIORITY ABSTRACTION ---------------- */

abstract class RepairPriorityPolicy {
    public abstract int calculatePriority(RoadDamage damage);
}

class DefaultPriorityPolicy extends RepairPriorityPolicy {

    private Map<String, Integer> weights;

    public DefaultPriorityPolicy() {
        weights = new HashMap<>();

        weights.put("severity", 3);
        weights.put("risk", 3);
        weights.put("traffic", 2);
        weights.put("importance", 2);
    }

    @Override
    public int calculatePriority(RoadDamage damage) {
        return damage.getSeverity() * weights.get("severity")
             + damage.getAccidentRisk() * weights.get("risk")
             + damage.getTrafficRank() * weights.get("traffic")
             + damage.getImportanceRank() * weights.get("importance");
    }
}

/* ---------------- MAINTENANCE TEAM ---------------- */

class MaintenanceTeam extends User {

    private String teamId;
    private String location;
    private boolean available;
    private Set<Equipment> equipment;
    private RepairJob currentJob;

    public MaintenanceTeam(String teamId, String username,
                            String password, String location) {
        super(username, password);

        this.teamId = teamId;
        this.location = location;
        this.available = true;
        this.equipment = new HashSet<>();
        this.currentJob = null;
    }

    public String getTeamId() {
        return teamId;
    }

    public String getLocation() {
        return location;
    }

    public boolean isAvailable() {
        return available;
    }

    public RepairJob getCurrentJob() {
        return currentJob;
    }

    public void setAvailable(boolean available) {
        this.available = available;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public void addEquipment(Equipment item) {
        equipment.add(item);
    }

    public boolean hasEquipment(Equipment item) {
        return equipment.contains(item);
    }

    public boolean hasAllEquipment(Set<Equipment> required) {
        return equipment.containsAll(required);
    }

    public void assignJobToTeam(RepairJob job)
            throws TeamUnavailableException {

        if (!available) {
            throw new TeamUnavailableException(
                "Team " + teamId + " is not available."
            );
        }

        currentJob = job;
        available = false;
    }

    public void completeJob() {
        currentJob = null;
        available = true;
    }

    public void display() {
        System.out.println(
            "Team ID: " + teamId +
            " | Location: " + location +
            " | Available: " + available +
            " | Equipment: " + equipment
        );
    }
}

/* ---------------- REPAIR JOB INHERITANCE ---------------- */

abstract class RepairJob {

    private int jobId;
    private RoadDamage damage;
    private MaintenanceTeam team;
    private RepairStatus status;
    private String assignedTime;
    private int estimatedTime;

    public RepairJob(int jobId, RoadDamage damage) {
        this.jobId = jobId;
        this.damage = damage;
        this.status = RepairStatus.PENDING;
        this.assignedTime = "";
        this.estimatedTime = 0;
    }

    public int getJobId() {
        return jobId;
    }

    public RoadDamage getDamage() {
        return damage;
    }

    public MaintenanceTeam getTeam() {
        return team;
    }

    public RepairStatus getStatus() {
        return status;
    }

    public int getEstimatedTime() {
        return estimatedTime;
    }

    public void setEstimatedTime(int estimatedTime) {
        this.estimatedTime = estimatedTime;
    }

    /*
     * Method overloading.
     * Version 1: assign a team.
     */
    public void assignJob(MaintenanceTeam team)
            throws TeamUnavailableException {

        if (!team.isAvailable()) {
            throw new TeamUnavailableException(
                "Selected team is unavailable."
            );
        }

        this.team = team;
        this.status = RepairStatus.ASSIGNED;
        this.assignedTime = new Date().toString();

        team.assignJobToTeam(this);
    }

    /*
     * Version 2: assign a team and estimated repair time.
     * Same method name, different parameters.
     */
    public void assignJob(MaintenanceTeam team, int estimatedTime)
            throws TeamUnavailableException {

        assignJob(team);
        this.estimatedTime = estimatedTime;
    }

    public void startRepair()
            throws InvalidRepairStateException {

        if (status != RepairStatus.ASSIGNED) {
            throw new InvalidRepairStateException(
                "Repair must be assigned before it can start."
            );
        }

        status = RepairStatus.IN_PROGRESS;
    }

    public void completeRepair()
            throws InvalidRepairStateException {

        if (status != RepairStatus.IN_PROGRESS) {
            throw new InvalidRepairStateException(
                "Repair must be in progress before completion."
            );
        }

        status = RepairStatus.COMPLETED;

        if (team != null) {
            team.completeJob();
        }
    }

    // Abstract method: subclasses must implement it differently
    public abstract Set<Equipment> requiredEquipment();

    public abstract int calculateRepairTime();

    public void display() {
        System.out.println(
            "Job ID: " + jobId +
            " | Damage ID: " + damage.getDamageId() +
            " | Type: " + damage.getType() +
            " | Status: " + status +
            " | Team: " +
            (team == null ? "Not assigned" : team.getTeamId()) +
            " | Estimated Time: " + estimatedTime + " minutes"
        );
    }
}

/* Child class 1 */
class PotholeRepair extends RepairJob {

    private int potholeSize;

    public PotholeRepair(int jobId, RoadDamage damage, int potholeSize) {
        super(jobId, damage);
        this.potholeSize = potholeSize;
    }

    @Override
    public Set<Equipment> requiredEquipment() {
        Set<Equipment> required = new HashSet<>();
        required.add(Equipment.JACKHAMMER);
        required.add(Equipment.ASPHALT_MIXER);
        return required;
    }

    @Override
    public int calculateRepairTime() {
        return 30 + potholeSize * 10;
    }
}

/* Child class 2 */
class ResurfacingRepair extends RepairJob {

    private int areaSize;

    public ResurfacingRepair(int jobId, RoadDamage damage, int areaSize) {
        super(jobId, damage);
        this.areaSize = areaSize;
    }

    @Override
    public Set<Equipment> requiredEquipment() {
        Set<Equipment> required = new HashSet<>();
        required.add(Equipment.PAVER);
        required.add(Equipment.ROAD_ROLLER);
        return required;
    }

    @Override
    public int calculateRepairTime() {
        return 60 + areaSize * 5;
    }
}

/* ---------------- ROAD NETWORK ---------------- */

class RoadEdge {

    private String to;
    private int travelTime;
    private boolean isOpen;

    public RoadEdge(String to, int travelTime) {
        this.to = to;
        this.travelTime = travelTime;
        this.isOpen = true;
    }

    public String getTo() {
        return to;
    }

    public int getTravelTime() {
        return travelTime;
    }

    public boolean isOpen() {
        return isOpen;
    }

    public void close() {
        isOpen = false;
    }

    public void open() {
        isOpen = true;
    }
}

class RoadNetwork {

    private Map<String, List<RoadEdge>> graph;
    private Set<String> locations;

    public RoadNetwork() {
        graph = new HashMap<>();
        locations = new HashSet<>();
    }

    public void addLocation(String location) {
        locations.add(location);
        graph.putIfAbsent(location, new ArrayList<>());
    }

    public void addRoad(String from, String to, int travelTime) {
        addLocation(from);
        addLocation(to);

        graph.get(from).add(new RoadEdge(to, travelTime));
        graph.get(to).add(new RoadEdge(from, travelTime));
    }

    public void closeRoad(String from, String to) {
        changeRoadStatus(from, to, false);
    }

    public void openRoad(String from, String to) {
        changeRoadStatus(from, to, true);
    }

    private void changeRoadStatus(String from, String to, boolean open) {
        if (!graph.containsKey(from)) {
            return;
        }

        for (RoadEdge edge : graph.get(from)) {
            if (edge.getTo().equals(to)) {
                if (open) {
                    edge.open();
                } else {
                    edge.close();
                }
            }
        }

        if (!graph.containsKey(to)) {
            return;
        }

        for (RoadEdge edge : graph.get(to)) {
            if (edge.getTo().equals(from)) {
                if (open) {
                    edge.open();
                } else {
                    edge.close();
                }
            }
        }
    }

    /*
     * Dijkstra's shortest path algorithm.
     * Returns the minimum travel time.
     */
    public int findShortestPath(String start, String destination) {

        if (!graph.containsKey(start) || !graph.containsKey(destination)) {
            return -1;
        }

        Map<String, Integer> distance = new HashMap<>();

        for (String location : locations) {
            distance.put(location, Integer.MAX_VALUE);
        }

        distance.put(start, 0);

        // PriorityQueue works as a min-heap using the smallest distance first.
        PriorityQueue<String> queue =
            new PriorityQueue<>(Comparator.comparingInt(distance::get));

        queue.add(start);

        while (!queue.isEmpty()) {

            String current = queue.poll();

            if (current.equals(destination)) {
                return distance.get(current);
            }

            for (RoadEdge edge : graph.get(current)) {

                if (!edge.isOpen()) {
                    continue;
                }

                String next = edge.getTo();

                int newDistance =
                    distance.get(current) + edge.getTravelTime();

                if (newDistance < distance.get(next)) {
                    distance.put(next, newDistance);

                    // Reinsert because the distance changed.
                    queue.remove(next);
                    queue.add(next);
                }
            }
        }

        return -1;
    }
}

/* ---------------- MAIN SYSTEM ---------------- */

public class Main {

    // HashMap stores all damage reports using damage ID.
    static Map<Integer, RoadDamage> damages = new HashMap<>();

    // HashMap stores all teams using team ID.
    static Map<String, MaintenanceTeam> teams = new HashMap<>();

    // Stores repair jobs.
    static Map<Integer, RepairJob> jobs = new HashMap<>();

    // PriorityQueue gives highest priority repair first.
    static PriorityQueue<RepairJob> repairQueue =
        new PriorityQueue<>(
            (a, b) -> Integer.compare(
                b.getDamage().getPriority(),
                a.getDamage().getPriority()
            )
        );

    static RoadNetwork roadNetwork = new RoadNetwork();

    static RepairPriorityPolicy priorityPolicy =
        new DefaultPriorityPolicy();

    static Scanner scanner = new Scanner(System.in);

    static int nextDamageId = 1;
    static int nextJobId = 1;

    static PublicUser publicUser =
        new PublicUser("public", "1234");

    static MunicipalOperator operator =
        new MunicipalOperator("operator", "1234");

    public static void main(String[] args) {

        createSampleNetwork();
        createSampleTeams();

        System.out.println("SMART MUNICIPAL ROAD MAINTENANCE SYSTEM");

        while (true) {

            System.out.println("\nLOGIN");
            System.out.println("1. Public");
            System.out.println("2. Municipal Operator");
            System.out.println("3. Maintenance Team");
            System.out.println("4. Exit");

            int choice = readInt("Enter choice: ");

            if (choice == 1) {
                publicLogin();
            } else if (choice == 2) {
                operatorLogin();
            } else if (choice == 3) {
                teamLogin();
            } else if (choice == 4) {
                System.out.println("Program ended.");
                break;
            } else {
                System.out.println("Invalid choice.");
            }
        }
    }

    /* ---------------- LOGIN ---------------- */

    static void publicLogin() {

        String username = readString("Username: ");
        String password = readString("Password: ");

        if (!publicUser.login(username, password)) {
            System.out.println("Invalid public login.");
            return;
        }

        while (true) {

            System.out.println("\nPUBLIC MENU");
            System.out.println("1. Submit Road Complaint");
            System.out.println("2. View My Complaints");
            System.out.println("3. Logout");

            int choice = readInt("Enter choice: ");

            if (choice == 1) {
                submitComplaint();
            } else if (choice == 2) {
                viewComplaints();
            } else if (choice == 3) {
                return;
            } else {
                System.out.println("Invalid choice.");
            }
        }
    }

    static void operatorLogin() {

        String username = readString("Username: ");
        String password = readString("Password: ");

        if (!operator.login(username, password)) {
            System.out.println("Invalid operator login.");
            return;
        }

        while (true) {

            System.out.println("\nMUNICIPAL OPERATOR MENU");
            System.out.println("1. View Damage Reports");
            System.out.println("2. Update Damage");
            System.out.println("3. Calculate Priorities");
            System.out.println("4. Assign Next Repair");
            System.out.println("5. View Repair Jobs");
            System.out.println("6. View Maintenance Teams");
            System.out.println("7. Find Fastest Route");
            System.out.println("8. Close Road");
            System.out.println("9. Reopen Road");
            System.out.println("10. Logout");

            int choice = readInt("Enter choice: ");

            if (choice == 1) {
                viewComplaints();
            } else if (choice == 2) {
                updateDamage();
            } else if (choice == 3) {
                calculatePriorities();
            } else if (choice == 4) {
                assignNextRepair();
            } else if (choice == 5) {
                viewJobs();
            } else if (choice == 6) {
                viewTeams();
            } else if (choice == 7) {
                findFastestRoute();
            } else if (choice == 8) {
                closeRoad();
            } else if (choice == 9) {
                reopenRoad();
            } else if (choice == 10) {
                return;
            } else {
                System.out.println("Invalid choice.");
            }
        }
    }

    static void teamLogin() {

        String username = readString("Team username: ");
        String password = readString("Password: ");

        MaintenanceTeam loggedTeam = null;

        for (MaintenanceTeam team : teams.values()) {
            if (team.login(username, password)) {
                loggedTeam = team;
                break;
            }
        }

        if (loggedTeam == null) {
            System.out.println("Invalid team login.");
            return;
        }

        while (true) {

            System.out.println("\nMAINTENANCE TEAM MENU");
            System.out.println("Logged in team: " + loggedTeam.getTeamId());
            System.out.println("1. View Assigned Job");
            System.out.println("2. Start Repair");
            System.out.println("3. Complete Repair");
            System.out.println("4. Logout");

            int choice = readInt("Enter choice: ");

            if (choice == 1) {
                viewAssignedJob(loggedTeam);
            } else if (choice == 2) {
                startTeamRepair(loggedTeam);
            } else if (choice == 3) {
                completeTeamRepair(loggedTeam);
            } else if (choice == 4) {
                return;
            } else {
                System.out.println("Invalid choice.");
            }
        }
    }

    /* ---------------- PUBLIC FUNCTIONS ---------------- */

    static void submitComplaint() {

        System.out.println("\nSUBMIT ROAD COMPLAINT");

        String location = readString("Location: ");
        int severity = readRange("Severity (1-3): ", 1, 3);
        int risk = readRange("Accident risk (1-3): ", 1, 3);
        int traffic = readRange("Traffic rank (1-3): ", 1, 3);
        int importance = readRange("Road importance (1-3): ", 1, 3);
        String type = readString("Damage type (Pothole/Resurfacing): ");

        RoadDamage damage = new RoadDamage(
            nextDamageId++,
            location,
            severity,
            risk,
            traffic,
            importance,
            type
        );

        damages.put(damage.getDamageId(), damage);

        System.out.println(
            "Complaint submitted. Damage ID: " +
            damage.getDamageId()
        );
    }

    /* ---------------- OPERATOR FUNCTIONS ---------------- */

    static void viewComplaints() {

        if (damages.isEmpty()) {
            System.out.println("No damage reports.");
            return;
        }

        for (RoadDamage damage : damages.values()) {
            damage.display();
        }
    }

    static void updateDamage() {

        int id = readInt("Enter damage ID: ");

        RoadDamage damage = damages.get(id);

        if (damage == null) {
            System.out.println("Damage not found.");
            return;
        }

        int severity = readRange("New severity (1-3): ", 1, 3);
        int risk = readRange("New accident risk (1-3): ", 1, 3);
        int traffic = readRange("New traffic rank (1-3): ", 1, 3);
        int importance = readRange("New road importance (1-3): ", 1, 3);

        damage.updateDamage(
            severity,
            risk,
            traffic,
            importance
        );

        System.out.println("Damage updated successfully.");
    }

    static void calculatePriorities() {

        repairQueue.clear();

        for (RoadDamage damage : damages.values()) {

            int priority =
                priorityPolicy.calculatePriority(damage);

            damage.setPriority(priority);

            // Create a repair job only if one doesn't already exist.
            boolean alreadyCreated = false;

            for (RepairJob job : jobs.values()) {
                if (job.getDamage().getDamageId() ==
                    damage.getDamageId()) {
                    alreadyCreated = true;
                    break;
                }
            }

            if (!alreadyCreated) {

                RepairJob job;

                /*
                 * Polymorphism:
                 * RepairJob reference points to a child object.
                 */
                if (damage.getType().equalsIgnoreCase("Pothole")) {

                    int size = Math.max(1, damage.getSeverity());

                    job = new PotholeRepair(
                        nextJobId++,
                        damage,
                        size
                    );

                } else {

                    int area = damage.getSeverity() * 10;

                    job = new ResurfacingRepair(
                        nextJobId++,
                        damage,
                        area
                    );
                }

                job.setEstimatedTime(
                    job.calculateRepairTime()
                );

                jobs.put(job.getJobId(), job);
            }
        }

        for (RepairJob job : jobs.values()) {
            if (job.getStatus() == RepairStatus.PENDING) {
                repairQueue.add(job);
            }
        }

        System.out.println("Priorities calculated.");
        System.out.println("Pending repairs added to PriorityQueue.");
    }

    static void assignNextRepair() {

        if (repairQueue.isEmpty()) {
            System.out.println(
                "No pending repair jobs. Calculate priorities first."
            );
            return;
        }

        RepairJob selectedJob = repairQueue.poll();

        System.out.println("\nNEXT REPAIR");
        selectedJob.display();

        MaintenanceTeam selectedTeam = null;

        for (MaintenanceTeam team : teams.values()) {

            if (team.isAvailable() &&
                team.hasAllEquipment(
                    selectedJob.requiredEquipment())) {

                selectedTeam = team;
                break;
            }
        }

        if (selectedTeam == null) {

            System.out.println(
                "No available team has the required equipment."
            );

            // Put job back into queue.
            repairQueue.add(selectedJob);
            return;
        }

        try {

            // Demonstrates overloaded assignJob() method.
            selectedJob.assignJob(
                selectedTeam,
                selectedJob.calculateRepairTime()
            );

            System.out.println(
                "Job " + selectedJob.getJobId() +
                " assigned to Team " +
                selectedTeam.getTeamId()
            );

            System.out.println(
                "Required equipment: " +
                selectedJob.requiredEquipment()
            );

        } catch (TeamUnavailableException e) {

            System.out.println(
                "Assignment failed: " + e.getMessage()
            );

            repairQueue.add(selectedJob);
        }
    }

    static void viewJobs() {

        if (jobs.isEmpty()) {
            System.out.println("No repair jobs.");
            return;
        }

        for (RepairJob job : jobs.values()) {
            job.display();
        }
    }

    static void viewTeams() {

        for (MaintenanceTeam team : teams.values()) {
            team.display();
        }
    }

    /* ---------------- TEAM FUNCTIONS ---------------- */

    static void viewAssignedJob(MaintenanceTeam team) {

        if (team.getCurrentJob() == null) {
            System.out.println("No job assigned.");
        } else {
            team.getCurrentJob().display();
        }
    }

    static void startTeamRepair(MaintenanceTeam team) {

        RepairJob job = team.getCurrentJob();

        if (job == null) {
            System.out.println("No assigned job.");
            return;
        }

        try {

            job.startRepair();

            System.out.println(
                "Repair job " + job.getJobId() +
                " has started."
            );

        } catch (InvalidRepairStateException e) {

            System.out.println(
                "Cannot start repair: " + e.getMessage()
            );
        }
    }

    static void completeTeamRepair(MaintenanceTeam team) {

        RepairJob job = team.getCurrentJob();

        if (job == null) {
            System.out.println("No assigned job.");
            return;
        }

        try {

            job.completeRepair();

            System.out.println(
                "Repair job " + job.getJobId() +
                " completed successfully."
            );

        } catch (InvalidRepairStateException e) {

            System.out.println(
                "Cannot complete repair: " + e.getMessage()
            );
        }
    }

    /* ---------------- ROUTING ---------------- */

    static void findFastestRoute() {

        String start = readString("Team/start location: ");
        String destination = readString("Destination location: ");

        int time =
            roadNetwork.findShortestPath(start, destination);

        if (time == -1) {
            System.out.println(
                "No available route was found."
            );
        } else {
            System.out.println(
                "Fastest available travel time: " +
                time + " minutes"
            );
        }
    }

    static void closeRoad() {

        String from = readString("Road starts at: ");
        String to = readString("Road ends at: ");

        roadNetwork.closeRoad(from, to);

        System.out.println("Road closed.");
    }

    static void reopenRoad() {

        String from = readString("Road starts at: ");
        String to = readString("Road ends at: ");

        roadNetwork.openRoad(from, to);

        System.out.println("Road reopened.");
    }

    /* ---------------- SAMPLE DATA ---------------- */

    static void createSampleNetwork() {

        roadNetwork.addRoad("L1", "L2", 10);
        roadNetwork.addRoad("L2", "L3", 15);
        roadNetwork.addRoad("L1", "L4", 20);
        roadNetwork.addRoad("L4", "L3", 10);
        roadNetwork.addRoad("L3", "L5", 12);
        roadNetwork.addRoad("L2", "L5", 30);
    }

    static void createSampleTeams() {

        MaintenanceTeam team1 =
            new MaintenanceTeam(
                "T01",
                "team01",
                "1234",
                "L2"
            );

        team1.addEquipment(Equipment.JACKHAMMER);
        team1.addEquipment(Equipment.ASPHALT_MIXER);

        MaintenanceTeam team2 =
            new MaintenanceTeam(
                "T02",
                "team02",
                "1234",
                "L4"
            );

        team2.addEquipment(Equipment.PAVER);
        team2.addEquipment(Equipment.ROAD_ROLLER);

        MaintenanceTeam team3 =
            new MaintenanceTeam(
                "T03",
                "team03",
                "1234",
                "L5"
            );

        team3.addEquipment(Equipment.JACKHAMMER);
        team3.addEquipment(Equipment.ASPHALT_MIXER);
        team3.addEquipment(Equipment.PAVER);
        team3.addEquipment(Equipment.ROAD_ROLLER);

        teams.put(team1.getTeamId(), team1);
        teams.put(team2.getTeamId(), team2);
        teams.put(team3.getTeamId(), team3);
    }

    /* ---------------- INPUT HELPERS ---------------- */

    static int readInt(String message) {

        while (true) {

            try {
                System.out.print(message);
                return Integer.parseInt(scanner.nextLine());

            } catch (NumberFormatException e) {

                System.out.println(
                    "Please enter a valid number."
                );
            }
        }
    }

    static int readRange(String message, int min, int max) {

        while (true) {

            int value = readInt(message);

            if (value >= min && value <= max) {
                return value;
            }

            System.out.println(
                "Enter a value between " + min +
                " and " + max + "."
            );
        }
    }

    static String readString(String message) {
        System.out.print(message);
        return scanner.nextLine();
    }
}
